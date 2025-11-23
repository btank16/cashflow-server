"""Polygon boundary construction from OSM ways using geometric algorithms."""

from typing import Dict, Any, List, Tuple, Optional, Set
from shapely.geometry import LineString, Point, Polygon, MultiPoint, box
from shapely.ops import unary_union, polygonize
from shapely.strtree import STRtree
import networkx as nx
import logging

from ..common.types import FunctionResult, ErrorCode
from ..common.utils import create_error_response, create_success_response
from ..common.osm_config import (
    MAX_INTERPOLATION_DISTANCE,
    POLYGON_MIN_AREA,
    POLYGON_MAX_AREA
)

logger = logging.getLogger(__name__)


class BoundaryBuilder:
    """Build polygon boundaries from OSM ways using intersection-based algorithms."""

    def __init__(self, osm_ways: List[Dict[str, Any]], bbox: List[float]):
        """
        Initialize boundary builder with OSM ways and bounding box.

        Args:
            osm_ways: List of OSM way objects with nodes
            bbox: Bounding box as [min_lat, max_lat, min_lon, max_lon]
        """
        self.osm_ways = osm_ways
        self.bbox = bbox
        self.linestrings: List[Tuple[LineString, Dict]] = []
        self.bbox_edges: List[LineString] = []
        self.graph = nx.Graph()
        self.intersections: Set[Tuple[float, float]] = set()

        logger.info(f"BoundaryBuilder initialized with {len(osm_ways)} ways")

    def _convert_ways_to_linestrings(self) -> None:
        """Convert OSM ways to Shapely LineString objects."""
        for way in self.osm_ways:
            try:
                nodes = way.get('nodes', [])
                if len(nodes) < 2:
                    logger.warning(f"Way {way.get('id')} has fewer than 2 nodes, skipping")
                    continue

                # Convert nodes to (lon, lat) coordinates for Shapely
                coords = [(node['lon'], node['lat']) for node in nodes]

                linestring = LineString(coords)

                # Store linestring with metadata
                metadata = {
                    'id': way.get('id'),
                    'category': way.get('category'),
                    'type': way.get('type'),
                    'name': way.get('name')
                }

                self.linestrings.append((linestring, metadata))

            except Exception as e:
                logger.warning(f"Failed to convert way {way.get('id')} to LineString: {e}")
                continue

        logger.info(f"Converted {len(self.linestrings)} ways to LineStrings")

    def _create_bbox_edges(self) -> None:
        """Create bounding box edges as LineStrings for polygon closure."""
        min_lat, max_lat, min_lon, max_lon = self.bbox

        # Create four edges of the bounding box (lon, lat format)
        edges = [
            # North edge
            LineString([(min_lon, max_lat), (max_lon, max_lat)]),
            # East edge
            LineString([(max_lon, max_lat), (max_lon, min_lat)]),
            # South edge
            LineString([(max_lon, min_lat), (min_lon, min_lat)]),
            # West edge
            LineString([(min_lon, min_lat), (min_lon, max_lat)])
        ]

        self.bbox_edges = edges
        logger.info("Created bounding box edges")

    def _find_all_intersections(self) -> None:
        """
        Find all intersection points between ways and bbox edges.

        Uses STRtree spatial indexing for O(n log n) performance when available,
        with fallback to O(n²) brute-force if needed.
        """
        all_lines = [ls for ls, _ in self.linestrings] + self.bbox_edges

        if not all_lines:
            logger.warning("No lines to find intersections for")
            return

        # Try optimized STRtree approach first
        try:
            self._find_intersections_strtree(all_lines)
            if len(self.intersections) > 0:
                return
            logger.warning("STRtree found no intersections, falling back to brute force")
        except Exception as e:
            logger.warning(f"STRtree approach failed: {e}, falling back to brute force")

        # Fallback to original O(n²) brute-force algorithm
        self._find_intersections_brute_force(all_lines)

    def _find_intersections_strtree(self, all_lines: List[LineString]) -> None:
        """Find intersections using STRtree spatial index (optimized)."""
        logger.info(f"Using STRtree spatial index for {len(all_lines)} lines")

        # Build spatial index
        tree = STRtree(all_lines)
        checked_pairs = set()

        # For each line, query spatial index
        for i, line1 in enumerate(all_lines):
            # Query returns indices of potentially intersecting lines
            potential_indices = tree.query(line1)

            # Convert to list (handles numpy array or other return types)
            try:
                indices_to_check = list(potential_indices)
            except (TypeError, ValueError):
                indices_to_check = []

            for j in indices_to_check:
                # Skip self and already-checked pairs
                if i == j:
                    continue

                pair_key = tuple(sorted([i, j]))
                if pair_key in checked_pairs:
                    continue

                checked_pairs.add(pair_key)

                # Get actual line and check intersection
                line2 = all_lines[j]
                if line1.intersects(line2):
                    intersection = line1.intersection(line2)
                    self._add_intersection_points(intersection)

        # Add endpoints and corners
        self._add_endpoints_and_corners()

        logger.info(f"STRtree found {len(self.intersections)} intersection points")

    def _find_intersections_brute_force(self, all_lines: List[LineString]) -> None:
        """Find intersections using O(n²) brute force (fallback)."""
        logger.info(f"Using brute-force intersection detection for {len(all_lines)} lines")

        # Check all pairs of lines
        for i, line1 in enumerate(all_lines):
            for line2 in all_lines[i + 1:]:
                if line1.intersects(line2):
                    intersection = line1.intersection(line2)
                    self._add_intersection_points(intersection)

        # Add endpoints and corners
        self._add_endpoints_and_corners()

        logger.info(f"Brute force found {len(self.intersections)} intersection points")

    def _add_intersection_points(self, intersection) -> None:
        """Add intersection points to the set based on intersection type."""
        if isinstance(intersection, Point):
            self.intersections.add((intersection.x, intersection.y))
        elif isinstance(intersection, MultiPoint):
            for point in intersection.geoms:
                self.intersections.add((point.x, point.y))
        elif isinstance(intersection, LineString):
            # Overlapping lines - add endpoints
            coords = list(intersection.coords)
            if coords:
                self.intersections.add(coords[0])
                self.intersections.add(coords[-1])

    def _add_endpoints_and_corners(self) -> None:
        """Add way endpoints and bounding box corners as intersection points."""
        # Add all endpoints of ways
        for line, _ in self.linestrings:
            coords = list(line.coords)
            if coords:
                self.intersections.add(coords[0])
                self.intersections.add(coords[-1])

        # Add bbox corners
        min_lat, max_lat, min_lon, max_lon = self.bbox
        self.intersections.add((min_lon, min_lat))
        self.intersections.add((min_lon, max_lat))
        self.intersections.add((max_lon, min_lat))
        self.intersections.add((max_lon, max_lat))

    def _build_graph(self) -> None:
        """Build planar graph with intersections as nodes and way segments as edges."""
        # Add all intersection points as nodes
        for point in self.intersections:
            self.graph.add_node(point)

        # Add edges for way segments between intersections
        all_lines = [ls for ls, _ in self.linestrings] + self.bbox_edges

        for line in all_lines:
            # Find which intersection points lie on this line
            points_on_line = []
            for point in self.intersections:
                shapely_point = Point(point)
                if line.distance(shapely_point) < 1e-8:  # Tolerance for floating point
                    # Find position along line
                    distance = line.project(shapely_point)
                    points_on_line.append((distance, point))

            # Sort points by position along line
            points_on_line.sort(key=lambda x: x[0])

            # Add edges between consecutive points
            for i in range(len(points_on_line) - 1):
                point1 = points_on_line[i][1]
                point2 = points_on_line[i + 1][1]

                # Calculate edge length
                edge_line = LineString([point1, point2])
                length = edge_line.length

                self.graph.add_edge(point1, point2, length=length)

        logger.info(f"Built graph with {self.graph.number_of_nodes()} nodes and {self.graph.number_of_edges()} edges")

    def _extract_faces(self) -> List[Polygon]:
        """Extract all faces (closed regions) from the planar graph."""
        try:
            # Use polygonize to find all closed regions
            all_lines = []

            # Convert graph edges to LineStrings
            for edge in self.graph.edges():
                line = LineString([edge[0], edge[1]])
                all_lines.append(line)

            # Find all polygons formed by these lines
            polygons = list(polygonize(all_lines))

            # Filter valid polygons
            valid_polygons = []
            for polygon in polygons:
                area = polygon.area
                if POLYGON_MIN_AREA <= area <= POLYGON_MAX_AREA:
                    valid_polygons.append(polygon)
                else:
                    logger.debug(f"Filtered polygon with area {area} (outside valid range)")

            logger.info(f"Extracted {len(valid_polygons)} valid polygons from {len(polygons)} total")
            return valid_polygons

        except Exception as e:
            logger.error(f"Failed to extract faces: {e}")
            return []

    def build_all_polygons(self) -> List[Polygon]:
        """
        Build all possible polygons from OSM ways.

        Returns:
            List of all valid polygons formed by way intersections
        """
        try:
            # Step 1: Convert ways to LineStrings
            self._convert_ways_to_linestrings()

            if not self.linestrings:
                logger.warning("No valid linestrings created from OSM ways")
                return []

            # Step 2: Create bounding box edges
            self._create_bbox_edges()

            # Step 3: Find all intersections
            self._find_all_intersections()

            # Step 4: Build planar graph
            self._build_graph()

            # Step 5: Extract all faces
            polygons = self._extract_faces()

            return polygons

        except Exception as e:
            logger.error(f"Failed to build polygons: {e}", exc_info=True)
            return []

    def select_polygon_for_address(
        self,
        target_coords: Tuple[float, float],
        polygons: List[Polygon]
    ) -> Optional[Dict[str, Any]]:
        """
        Select the smallest polygon containing the target address.

        Args:
            target_coords: (longitude, latitude) of target address
            polygons: List of candidate polygons

        Returns:
            GeoJSON representation of selected polygon, or None if no match
        """
        target_point = Point(target_coords)

        # Find all polygons that contain the target point
        containing_polygons = []
        for polygon in polygons:
            if polygon.contains(target_point):
                containing_polygons.append(polygon)

        if not containing_polygons:
            logger.warning("No polygon contains the target address")
            return None

        # Select the smallest polygon (most specific boundary)
        smallest_polygon = min(containing_polygons, key=lambda p: p.area)

        logger.info(
            f"Selected polygon with area {smallest_polygon.area:.6f} "
            f"from {len(containing_polygons)} containing polygons"
        )

        # Convert to GeoJSON
        return self._polygon_to_geojson(smallest_polygon, target_coords)

    def _polygon_to_geojson(
        self,
        polygon: Polygon,
        target_coords: Tuple[float, float]
    ) -> Dict[str, Any]:
        """
        Convert Shapely polygon to GeoJSON format with metadata.

        Args:
            polygon: Shapely Polygon object
            target_coords: (longitude, latitude) of target address

        Returns:
            GeoJSON Feature with polygon and properties
        """
        # Get exterior coordinates
        coords = list(polygon.exterior.coords)

        # Calculate statistics
        area_sq_degrees = polygon.area
        num_vertices = len(coords) - 1  # Subtract 1 because first and last are same

        # Find which ways form the boundary
        boundary_ways = []
        for linestring, metadata in self.linestrings:
            # Check if this way is part of the polygon boundary
            if polygon.boundary.distance(linestring) < 1e-6:
                boundary_ways.append({
                    'category': metadata['category'],
                    'type': metadata['type'],
                    'name': metadata['name']
                })

        geojson = {
            'type': 'Feature',
            'geometry': {
                'type': 'Polygon',
                'coordinates': [coords]
            },
            'properties': {
                'area_sq_degrees': area_sq_degrees,
                'area_sq_km': area_sq_degrees * 111 * 111,  # Rough conversion
                'num_vertices': num_vertices,
                'target_coords': {
                    'lon': target_coords[0],
                    'lat': target_coords[1]
                },
                'boundary_ways': boundary_ways[:10]  # Limit to first 10 for readability
            }
        }

        return geojson


def build_boundary_polygon(
    osm_ways: List[Dict[str, Any]],
    bbox: List[float],
    target_coords: Tuple[float, float]
) -> FunctionResult[Dict[str, Any]]:
    """
    Build polygon boundary from OSM ways for a specific target address.

    Args:
        osm_ways: List of OSM way objects
        bbox: Bounding box as [min_lat, max_lat, min_lon, max_lon]
        target_coords: (longitude, latitude) of target address

    Returns:
        FunctionResult containing selected polygon as GeoJSON
    """
    try:
        builder = BoundaryBuilder(osm_ways, bbox)

        # Build all possible polygons
        all_polygons = builder.build_all_polygons()

        if not all_polygons:
            return create_error_response(
                "No polygons could be constructed from OSM ways",
                ErrorCode.DATA_VALIDATION_ERROR
            )

        # Select polygon containing target address
        selected_polygon = builder.select_polygon_for_address(target_coords, all_polygons)

        if not selected_polygon:
            return create_error_response(
                "Target address not found within any constructed polygon",
                ErrorCode.NOT_FOUND
            )

        return create_success_response(
            {
                'polygon': selected_polygon,
                'total_polygons_found': len(all_polygons)
            },
            metadata={
                'polygons_constructed': len(all_polygons),
                'polygon_selected': True
            }
        )

    except Exception as e:
        logger.error(f"Failed to build boundary polygon: {e}", exc_info=True)
        return create_error_response(
            f"Failed to build boundary polygon: {str(e)}",
            ErrorCode.INTERNAL_ERROR
        )
