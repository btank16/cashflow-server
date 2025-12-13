"""Polygon boundary construction from OSM ways using geometric algorithms.

Optimized version with:
- Pre-computed edge-point associations for O(n) graph building
- Polygon adjacency graph for expansion through soft boundaries
- Tiered expansion based on boundary classification (hard vs soft)
"""

from typing import Dict, Any, List, Tuple, Optional, Set
from collections import defaultdict
from shapely.geometry import LineString, Point, Polygon, MultiPoint, MultiLineString
from shapely.ops import unary_union, polygonize
from shapely.strtree import STRtree
import networkx as nx
import logging

from ..common.types import FunctionResult, ErrorCode
from ..common.utils import create_error_response, create_success_response
from ..common.osm_config import (
    MAX_INTERPOLATION_DISTANCE,
    POLYGON_MIN_AREA,
    POLYGON_MAX_AREA,
    BBOX_BOUNDARY_CLASS,
    get_boundary_class,
    is_hard_boundary,
    is_soft_boundary
)

logger = logging.getLogger(__name__)

# Grid size for coordinate snapping (~1cm precision)
# This handles floating-point near-duplicates from different line intersections
GRID_SIZE = 1e-7  # ~1.1cm at the equator


def snap_to_grid(coords: Tuple[float, float]) -> Tuple[float, float]:
    """
    Snap coordinates to a fixed grid to handle floating-point precision issues.

    Near-duplicate intersection points (e.g., 0.00001 apart) from different
    lines will snap to the same grid point, ensuring graph connectivity.

    Args:
        coords: (x, y) coordinate tuple

    Returns:
        Snapped (x, y) coordinate tuple
    """
    return (
        round(coords[0] / GRID_SIZE) * GRID_SIZE,
        round(coords[1] / GRID_SIZE) * GRID_SIZE
    )


class BoundaryBuilder:
    """Build polygon boundaries from OSM ways using intersection-based algorithms.

    Optimized with pre-computed edge-point associations to reduce graph building
    from O(n × m) to O(n) complexity.
    """

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

        # Pre-compute optimization: Track which lines each intersection belongs to
        # Maps line_index -> [(distance_along_line, point_coords), ...]
        self.line_points: Dict[int, List[Tuple[float, Tuple[float, float]]]] = defaultdict(list)

        # Track boundary classification for each edge
        # Maps (point1, point2) sorted tuple -> {"way_type": str, "boundary_class": "hard"|"soft"|"bbox"}
        self.edge_metadata: Dict[Tuple, Dict[str, Any]] = {}

        # Store polygon data for adjacency analysis
        self.all_polygons: List[Polygon] = []
        self.polygon_adjacency: Dict[int, Dict[int, str]] = {}

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

                # Store linestring with metadata including boundary classification
                way_type = way.get('type', 'unknown')
                metadata = {
                    'id': way.get('id'),
                    'category': way.get('category'),
                    'type': way_type,
                    'name': way.get('name'),
                    'boundary_class': get_boundary_class(way_type)
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

        Optimized to also track which lines each intersection belongs to,
        enabling O(n) graph building instead of O(n × m).
        """
        all_lines = [ls for ls, _ in self.linestrings] + self.bbox_edges
        num_way_lines = len(self.linestrings)

        if not all_lines:
            logger.warning("No lines to find intersections for")
            return

        # Validate all_lines contains only LineString objects
        for idx, line in enumerate(all_lines):
            if not isinstance(line, LineString):
                raise TypeError(f"Expected all elements to be LineString, found {type(line)} at index {idx}")

        # Try optimized STRtree approach first
        try:
            self._find_intersections_strtree_precompute(all_lines, num_way_lines)
            if len(self.intersections) > 0:
                return
            logger.warning("STRtree found no intersections, falling back to brute force")
        except Exception as e:
            logger.warning(f"STRtree approach failed: {e}, falling back to brute force")

        # Fallback to brute-force algorithm with pre-compute
        self._find_intersections_brute_force_precompute(all_lines, num_way_lines)

    def _find_intersections_strtree_precompute(self, all_lines: List[LineString], num_way_lines: int) -> None:
        """Find intersections using STRtree with pre-computed line associations."""
        logger.info(f"Using STRtree spatial index for {len(all_lines)} lines")

        tree = STRtree(all_lines)
        checked_pairs = set()

        for i, line1 in enumerate(all_lines):
            potential_indices = tree.query(line1)

            # Handle numpy arrays
            indices_to_check = []
            try:
                if hasattr(potential_indices, 'tolist'):
                    indices_to_check = potential_indices.tolist()
                elif hasattr(potential_indices, '__iter__'):
                    indices_to_check = [int(idx) for idx in potential_indices]
                else:
                    indices_to_check = [int(potential_indices)]
            except (TypeError, ValueError, AttributeError):
                indices_to_check = []

            for j in indices_to_check:
                try:
                    j_int = int(j)
                except (TypeError, ValueError):
                    continue

                if i == j_int:
                    continue

                pair_key = tuple(sorted([i, j_int]))
                if pair_key in checked_pairs:
                    continue

                checked_pairs.add(pair_key)

                try:
                    line2 = all_lines[j_int]
                    if not isinstance(line2, LineString):
                        continue

                    if line1.intersects(line2):
                        intersection = line1.intersection(line2)
                        self._add_intersection_points_precompute(
                            intersection, i, j_int, line1, line2, num_way_lines
                        )

                except (IndexError, TypeError) as e:
                    logger.warning(f"Error accessing line at index {j_int}: {e}")
                    continue

        # Add endpoints with their line associations
        self._add_endpoints_precompute(all_lines, num_way_lines)

        logger.info(f"STRtree found {len(self.intersections)} intersection points")

    def _find_intersections_brute_force_precompute(self, all_lines: List[LineString], num_way_lines: int) -> None:
        """Find intersections using brute force with pre-computed line associations."""
        logger.info(f"Using brute-force intersection detection for {len(all_lines)} lines")

        for i, line1 in enumerate(all_lines):
            for j, line2 in enumerate(all_lines[i + 1:], start=i + 1):
                if line1.intersects(line2):
                    intersection = line1.intersection(line2)
                    self._add_intersection_points_precompute(
                        intersection, i, j, line1, line2, num_way_lines
                    )

        # Add endpoints with their line associations
        self._add_endpoints_precompute(all_lines, num_way_lines)

        logger.info(f"Brute force found {len(self.intersections)} intersection points")

    def _add_intersection_points_precompute(
        self,
        intersection,
        line1_idx: int,
        line2_idx: int,
        line1: LineString,
        line2: LineString,
        num_way_lines: int
    ) -> None:
        """Add intersection points and track which lines they belong to.

        Applies grid snapping to handle floating-point precision issues where
        near-duplicate points from different line pairs would create disconnected
        graph nodes.
        """
        points_to_add = []

        if isinstance(intersection, Point):
            points_to_add.append((intersection.x, intersection.y))
        elif isinstance(intersection, MultiPoint):
            for point in intersection.geoms:
                points_to_add.append((point.x, point.y))
        elif isinstance(intersection, LineString):
            # Overlapping lines - add endpoints
            coords = list(intersection.coords)
            if coords:
                points_to_add.append(coords[0])
                points_to_add.append(coords[-1])

        for raw_coords in points_to_add:
            # Snap to grid to handle floating-point near-duplicates
            coords = snap_to_grid(raw_coords)
            self.intersections.add(coords)

            # Pre-compute distance along each line (key optimization)
            # Use snapped coords for consistency
            point = Point(coords)
            dist1 = line1.project(point)
            dist2 = line2.project(point)

            self.line_points[line1_idx].append((dist1, coords))
            self.line_points[line2_idx].append((dist2, coords))

    def _add_endpoints_precompute(self, all_lines: List[LineString], num_way_lines: int) -> None:
        """Add way endpoints and bbox corners with their line associations.

        Applies grid snapping for consistency with intersection points.
        """
        # Add endpoints of ways
        for i, (line, _) in enumerate(self.linestrings):
            coords_list = list(line.coords)
            if coords_list:
                # Start point - snap to grid for consistency
                start = snap_to_grid(coords_list[0])
                self.intersections.add(start)
                if start not in [p[1] for p in self.line_points[i]]:
                    self.line_points[i].append((0.0, start))

                # End point - snap to grid for consistency
                end = snap_to_grid(coords_list[-1])
                self.intersections.add(end)
                if end not in [p[1] for p in self.line_points[i]]:
                    self.line_points[i].append((line.length, end))

        # Add bbox corners - snap to grid for consistency
        min_lat, max_lat, min_lon, max_lon = self.bbox
        corners = [
            snap_to_grid((min_lon, min_lat)),
            snap_to_grid((min_lon, max_lat)),
            snap_to_grid((max_lon, min_lat)),
            snap_to_grid((max_lon, max_lat))
        ]

        for corner in corners:
            self.intersections.add(corner)

        # Associate bbox corners with bbox edges
        for i, edge in enumerate(self.bbox_edges):
            edge_idx = num_way_lines + i
            coords_list = list(edge.coords)
            if coords_list:
                start = snap_to_grid(coords_list[0])
                end = snap_to_grid(coords_list[-1])
                if start not in [p[1] for p in self.line_points[edge_idx]]:
                    self.line_points[edge_idx].append((0.0, start))
                if end not in [p[1] for p in self.line_points[edge_idx]]:
                    self.line_points[edge_idx].append((edge.length, end))

    def _build_graph(self) -> None:
        """Build planar graph using pre-computed line-point associations.

        This is O(n) instead of O(n × m) because we already know which
        points belong to which lines from the intersection detection phase.
        """
        # Add all intersection points as nodes
        for point in self.intersections:
            self.graph.add_node(point)

        num_way_lines = len(self.linestrings)

        # Add edges using pre-computed associations
        for line_idx, points_on_line in self.line_points.items():
            if not points_on_line:
                continue

            # Sort points by distance along line (already pre-computed)
            sorted_points = sorted(points_on_line, key=lambda x: x[0])

            # Remove duplicates while preserving order
            seen = set()
            unique_points = []
            for dist, coords in sorted_points:
                if coords not in seen:
                    seen.add(coords)
                    unique_points.append((dist, coords))

            # Determine edge metadata based on line type
            if line_idx < num_way_lines:
                _, metadata = self.linestrings[line_idx]
                way_type = metadata.get('type', 'unknown')
                boundary_class = metadata.get('boundary_class', 'soft')
            else:
                way_type = "bbox_edge"
                boundary_class = BBOX_BOUNDARY_CLASS  # Always "hard"

            # Create edges between consecutive points
            for i in range(len(unique_points) - 1):
                point1 = unique_points[i][1]
                point2 = unique_points[i + 1][1]

                edge_length = LineString([point1, point2]).length

                self.graph.add_edge(point1, point2, length=edge_length)

                # Store edge metadata for adjacency analysis
                edge_key = tuple(sorted([point1, point2], key=lambda p: (p[0], p[1])))
                self.edge_metadata[edge_key] = {
                    "way_type": way_type,
                    "boundary_class": boundary_class,
                    "line_idx": line_idx
                }

        logger.info(f"Built graph with {self.graph.number_of_nodes()} nodes and {self.graph.number_of_edges()} edges")

    def _extract_faces(self) -> List[Polygon]:
        """Extract all faces (closed regions) from the planar graph."""
        try:
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

    def _build_polygon_adjacency(self, polygons: List[Polygon]) -> Dict[int, Dict[int, str]]:
        """
        Build adjacency graph between polygons with boundary classification.

        Args:
            polygons: List of Shapely Polygon objects

        Returns:
            Dict mapping polygon_idx -> {adjacent_polygon_idx: boundary_class, ...}

        The boundary_class is determined by the shared edge:
        - "hard": Adjacent via motorway, trunk, primary, or bbox edge
        - "soft": Adjacent via secondary roads, railways, or waterways
        """
        adjacency: Dict[int, Dict[int, str]] = {i: {} for i in range(len(polygons))}

        for i, poly1 in enumerate(polygons):
            for j, poly2 in enumerate(polygons[i + 1:], start=i + 1):
                # Check if polygons share an edge
                shared_boundary = poly1.boundary.intersection(poly2.boundary)

                if shared_boundary.is_empty:
                    continue

                # Calculate length of shared boundary
                if hasattr(shared_boundary, 'length'):
                    if shared_boundary.length < 1e-8:
                        continue  # Not a significant shared edge
                else:
                    continue

                # Determine boundary type of the shared edge
                boundary_class = self._classify_shared_boundary(shared_boundary)

                adjacency[i][j] = boundary_class
                adjacency[j][i] = boundary_class

        return adjacency

    def _classify_shared_boundary(self, shared_boundary) -> str:
        """
        Classify the shared boundary between two polygons as hard or soft.

        Samples points along the shared boundary and checks edge metadata.
        If ANY part of the shared edge is a hard boundary, returns "hard".
        """
        sample_points = []

        if isinstance(shared_boundary, Point):
            sample_points.append((shared_boundary.x, shared_boundary.y))
        elif isinstance(shared_boundary, LineString):
            # Sample at 25%, 50%, 75% along the line
            for frac in [0.25, 0.5, 0.75]:
                point = shared_boundary.interpolate(frac, normalized=True)
                sample_points.append((point.x, point.y))
        elif isinstance(shared_boundary, MultiLineString):
            for geom in shared_boundary.geoms:
                if isinstance(geom, LineString) and geom.length > 1e-8:
                    point = geom.interpolate(0.5, normalized=True)
                    sample_points.append((point.x, point.y))

        # Check each sample point against edge metadata
        for sample_coords in sample_points:
            boundary_class = self._get_boundary_class_at_point(sample_coords)
            if boundary_class == "hard":
                return "hard"

        return "soft"

    def _get_boundary_class_at_point(self, coords: Tuple[float, float]) -> str:
        """Get the boundary class for the edge at a specific point."""
        sample_point = Point(coords)

        # Find the edge that contains this point
        for edge_key, metadata in self.edge_metadata.items():
            edge_line = LineString([edge_key[0], edge_key[1]])
            if edge_line.distance(sample_point) < 1e-6:
                return metadata.get("boundary_class", "soft")

        return "soft"

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

            # Step 3: Find all intersections (with pre-compute optimization)
            self._find_all_intersections()

            # Step 4: Build planar graph (O(n) with pre-computed data)
            self._build_graph()

            # Step 5: Extract all faces
            polygons = self._extract_faces()

            # Store for adjacency analysis
            self.all_polygons = polygons

            return polygons

        except Exception as e:
            logger.error(f"Failed to build polygons: {e}", exc_info=True)
            return []

    def select_polygon_for_address(
        self,
        target_coords: Tuple[float, float],
        polygons: List[Polygon]
    ) -> Tuple[Optional[Dict[str, Any]], Optional[int]]:
        """
        Select the smallest polygon containing the target address.

        Args:
            target_coords: (longitude, latitude) of target address
            polygons: List of candidate polygons

        Returns:
            Tuple of (GeoJSON polygon, polygon_index) or (None, None) if no match
        """
        target_point = Point(target_coords)

        # Find all polygons that contain the target point
        containing_polygons = []
        for i, polygon in enumerate(polygons):
            if polygon.contains(target_point):
                containing_polygons.append((i, polygon))

        if not containing_polygons:
            logger.warning("No polygon contains the target address")
            return None, None

        # Select the smallest polygon (most specific boundary)
        selected_idx, smallest_polygon = min(containing_polygons, key=lambda x: x[1].area)

        logger.info(
            f"Selected polygon {selected_idx} with area {smallest_polygon.area:.6f} "
            f"from {len(containing_polygons)} containing polygons"
        )

        # Convert to GeoJSON
        geojson = self._polygon_to_geojson(smallest_polygon, target_coords)
        return geojson, selected_idx

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
        num_vertices = len(coords) - 1

        # Find which ways form the boundary
        boundary_ways = []
        for linestring, metadata in self.linestrings:
            if polygon.boundary.distance(linestring) < 1e-6:
                boundary_ways.append({
                    'category': metadata['category'],
                    'type': metadata['type'],
                    'name': metadata['name'],
                    'boundary_class': metadata.get('boundary_class', 'soft')
                })

        geojson = {
            'type': 'Feature',
            'geometry': {
                'type': 'Polygon',
                'coordinates': [coords]
            },
            'properties': {
                'area_sq_degrees': area_sq_degrees,
                'area_sq_km': area_sq_degrees * 111 * 111,
                'num_vertices': num_vertices,
                'target_coords': {
                    'lon': target_coords[0],
                    'lat': target_coords[1]
                },
                'boundary_ways': boundary_ways[:10]
            }
        }

        return geojson

    def expand_through_soft_boundaries(
        self,
        selected_polygon_idx: int,
        max_expansion_tiers: int = 2,
        enable_tier_three: bool = False,
        current_data_count: int = 0,
        min_data_for_tier_three: int = 2
    ) -> Tuple[Optional[Polygon], Dict[str, Any]]:
        """
        Expand a polygon by merging with adjacent polygons through soft boundaries.

        Args:
            selected_polygon_idx: Index of the starting polygon
            max_expansion_tiers: Maximum number of tier 1-2 expansion steps (default 2)
            enable_tier_three: If True, allow tier 3 expansion through primary roads
            current_data_count: Current filtered data count (used for tier 3 decision)
            min_data_for_tier_three: Trigger tier 3 if data count <= this value (default 2)

        Returns:
            Tuple of (expanded_polygon, expansion_metadata)

        Tier 1-2: Crosses soft boundaries (secondary roads, railways, waterways).
        Tier 3: Crosses primary roads (only if enable_tier_three=True and data insufficient).
        Hard boundaries (motorway, trunk, bbox edges) are never crossed.
        """
        if not self.all_polygons:
            return None, {"error": "No polygons available for expansion"}

        if selected_polygon_idx >= len(self.all_polygons):
            return None, {"error": f"Invalid polygon index: {selected_polygon_idx}"}

        # Build adjacency if not already done
        if not self.polygon_adjacency:
            self.polygon_adjacency = self._build_polygon_adjacency(self.all_polygons)

        original_polygon = self.all_polygons[selected_polygon_idx]
        original_area = original_polygon.area

        included = {selected_polygon_idx}
        expansion_log = []

        for tier in range(max_expansion_tiers):
            # Find adjacent polygons connected by soft boundaries
            candidates = set()
            for idx in list(included):
                for adj_idx, boundary_class in self.polygon_adjacency.get(idx, {}).items():
                    if adj_idx not in included and boundary_class == "soft":
                        candidates.add(adj_idx)

            if not candidates:
                logger.info(f"Expansion tier {tier + 1}: No more soft-boundary neighbors")
                break

            # Add all soft-boundary adjacent polygons
            for candidate in candidates:
                included.add(candidate)
                expansion_log.append({
                    "tier": tier + 1,
                    "added_polygon_idx": candidate,
                    "added_polygon_area": self.all_polygons[candidate].area
                })

            logger.info(f"Expansion tier {tier + 1}: Added {len(candidates)} polygons")

        # Tier 3: Expand through primary roads if enabled and data is insufficient
        tier_three_triggered = False
        if enable_tier_three and current_data_count <= min_data_for_tier_three:
            logger.info(f"Tier 3: Data count ({current_data_count}) <= threshold ({min_data_for_tier_three}), "
                        "attempting expansion through primary roads")

            # Find polygons adjacent via tier_three boundaries (primary roads)
            tier_three_candidates = set()
            for idx in list(included):
                for adj_idx, boundary_class in self.polygon_adjacency.get(idx, {}).items():
                    if adj_idx not in included and boundary_class == "tier_three":
                        tier_three_candidates.add(adj_idx)

            if tier_three_candidates:
                tier_three_triggered = True
                for candidate in tier_three_candidates:
                    included.add(candidate)
                    expansion_log.append({
                        "tier": 3,
                        "added_polygon_idx": candidate,
                        "added_polygon_area": self.all_polygons[candidate].area,
                        "crossed_boundary": "primary"
                    })
                logger.info(f"Tier 3: Added {len(tier_three_candidates)} polygons via primary roads")
            else:
                logger.info("Tier 3: No primary-road neighbors available")

        # Merge all included polygons
        if len(included) == 1:
            expanded_polygon = original_polygon
        else:
            polygons_to_merge = [self.all_polygons[i] for i in included]
            expanded_polygon = unary_union(polygons_to_merge)

        # Handle case where unary_union returns a MultiPolygon
        if hasattr(expanded_polygon, 'geoms'):
            # Take the largest polygon
            expanded_polygon = max(expanded_polygon.geoms, key=lambda p: p.area)

        metadata = {
            "original_polygon_idx": selected_polygon_idx,
            "original_area_sq_degrees": original_area,
            "expanded_area_sq_degrees": expanded_polygon.area,
            "included_polygon_count": len(included),
            "included_polygon_indices": list(included),
            "expansion_tiers_used": len(set(e["tier"] for e in expansion_log)) if expansion_log else 0,
            "expansion_log": expansion_log,
            "tier_three_triggered": tier_three_triggered
        }

        return expanded_polygon, metadata


def build_boundary_polygon(
    osm_ways: List[Dict[str, Any]],
    bbox: List[float],
    target_coords: Tuple[float, float],
    enable_expansion: bool = False
) -> FunctionResult[Dict[str, Any]]:
    """
    Build polygon boundary from OSM ways for a specific target address.

    Args:
        osm_ways: List of OSM way objects
        bbox: Bounding box as [min_lat, max_lat, min_lon, max_lon]
        target_coords: (longitude, latitude) of target address
        enable_expansion: If True, include data needed for polygon expansion

    Returns:
        FunctionResult containing:
        - polygon: Selected polygon as GeoJSON
        - total_polygons_found: Count of all polygons
        - selected_polygon_idx: Index of selected polygon (if enable_expansion)
        - If enable_expansion=True:
            - all_polygons_geojson: All polygons as GeoJSON (for debugging)
            - adjacency: Polygon adjacency graph
            - builder: Reference to BoundaryBuilder for expansion
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
        selected_polygon, selected_idx = builder.select_polygon_for_address(target_coords, all_polygons)

        if not selected_polygon:
            return create_error_response(
                "Target address not found within any constructed polygon",
                ErrorCode.NOT_FOUND
            )

        result_data = {
            'polygon': selected_polygon,
            'total_polygons_found': len(all_polygons),
            'selected_polygon_idx': selected_idx
        }

        # Include expansion data if requested
        if enable_expansion:
            # Build adjacency graph
            adjacency = builder._build_polygon_adjacency(all_polygons)
            builder.polygon_adjacency = adjacency

            result_data['adjacency'] = adjacency
            result_data['_builder'] = builder  # Internal reference for expand_boundary_polygon

        return create_success_response(
            result_data,
            metadata={
                'polygons_constructed': len(all_polygons),
                'polygon_selected': True,
                'expansion_enabled': enable_expansion
            }
        )

    except Exception as e:
        logger.error(f"Failed to build boundary polygon: {e}", exc_info=True)
        return create_error_response(
            f"Failed to build boundary polygon: {str(e)}",
            ErrorCode.INTERNAL_ERROR
        )


def expand_boundary_polygon(
    boundary_result: Dict[str, Any],
    target_coords: Tuple[float, float],
    max_tiers: int = 2,
    enable_tier_three: bool = False,
    current_data_count: int = 0,
    min_data_for_tier_three: int = 2
) -> FunctionResult[Dict[str, Any]]:
    """
    Expand a polygon result through soft boundaries.

    Args:
        boundary_result: Result data from build_boundary_polygon(enable_expansion=True)
        target_coords: (longitude, latitude) of target address (for GeoJSON)
        max_tiers: Maximum tier 1-2 expansion tiers (default 2)
        enable_tier_three: If True, allow tier 3 expansion through primary roads
        current_data_count: Current filtered data count (used for tier 3 decision)
        min_data_for_tier_three: Trigger tier 3 if data count <= this value (default 2)

    Returns:
        FunctionResult with expanded polygon as GeoJSON
    """
    try:
        builder = boundary_result.get('_builder')
        selected_idx = boundary_result.get('selected_polygon_idx')

        if builder is None:
            return create_error_response(
                "Expansion not enabled. Call build_boundary_polygon with enable_expansion=True",
                ErrorCode.VALIDATION_ERROR
            )

        if selected_idx is None:
            return create_error_response(
                "No selected polygon index found",
                ErrorCode.VALIDATION_ERROR
            )

        # Perform expansion (with optional tier 3)
        expanded_polygon, expansion_metadata = builder.expand_through_soft_boundaries(
            selected_idx,
            max_tiers,
            enable_tier_three=enable_tier_three,
            current_data_count=current_data_count,
            min_data_for_tier_three=min_data_for_tier_three
        )

        if expanded_polygon is None:
            return create_error_response(
                expansion_metadata.get("error", "Expansion failed"),
                ErrorCode.INTERNAL_ERROR
            )

        # Convert to GeoJSON
        expanded_geojson = builder._polygon_to_geojson(expanded_polygon, target_coords)

        return create_success_response(
            {
                'polygon': expanded_geojson,
                'expansion_metadata': expansion_metadata,
                'is_expanded': expansion_metadata['included_polygon_count'] > 1
            },
            metadata={
                'expansion_tiers_used': expansion_metadata['expansion_tiers_used'],
                'polygons_merged': expansion_metadata['included_polygon_count']
            }
        )

    except Exception as e:
        logger.error(f"Failed to expand boundary polygon: {e}", exc_info=True)
        return create_error_response(
            f"Failed to expand boundary polygon: {str(e)}",
            ErrorCode.INTERNAL_ERROR
        )
