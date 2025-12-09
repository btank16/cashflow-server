"""
New Rental Workflow Orchestrator.
Coordinates property data gathering using ThreadPoolExecutor for parallel operations.
"""

import time
import logging
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, Any, List, Optional, Tuple, Callable

from workflow_types import (
    NewRentalWorkflowInput,
    NewRentalWorkflowOutput,
    WorkflowConfig,
    WorkflowState,
    WorkflowStep,
    WorkflowStepStatus,
    WorkflowStepMetadata,
    WorkflowOutputMetadata,
    WorkflowData,
    GeocodingData,
    BoundingBoxData,
    PolygonData,
    PolygonExpansionMetadata,
    InterestRateData,
    PropertyInfoData,
    PropertyTaxData,
    SalesData,
    SalesDataEntry,
    ApartmentCompData,
    ApartmentCompEntry,
    UnitData,
    FormattedOutput,
    FilteredSalesData,
    FilteredApartmentData,
    FiveNumberSummaryResult,
    InputPropertyInfo
)

# Import from propertyDataGather
from propertyDataGather.common import (
    PerplexityClient,
    RentcastClient,
    GeminiClient,
    FunctionResult,
    ErrorCode,
    log_workflow_start,
    log_workflow_complete
)
from propertyDataGather.common.osm_config import calculate_radius_bbox
from propertyDataGather.functions.geocoding import get_coordinates, batch_geocode_addresses
from propertyDataGather.functions.osm_fetcher import fetch_osm_ways
from propertyDataGather.functions.boundary_builder import build_boundary_polygon, expand_boundary_polygon
from propertyDataGather.functions.interest_rates import get_interest_rate, adjust_interest_rate
from propertyDataGather.functions.rentcast_data import (
    get_rentcast_property_records,
    get_rentcast_rental_listings,
    get_rentcast_sale_listings
)
from propertyDataGather.functions.gemini_property_details import get_initial_property_info_gemini
from propertyDataGather.functions.property_tax import get_property_tax
from propertyDataGather.functions.gemini_property_sales import get_recent_property_sales
from propertyDataGather.functions.apartment_search import get_apartment_comps
from propertyDataGather.functions.metro_area_lookup import is_valid_city
from propertyDataGather.functions.neighborhood_lookup import get_neighborhood_name
from propertyDataGather.functions.address_checker import check_addresses_against_polygon
from propertyDataGather.functions.median_analysis import get_five_number_summary

logger = logging.getLogger(__name__)


class NewRentalWorkflowOrchestrator:
    """
    Orchestrates the new rental workflow using ThreadPoolExecutor for parallelism.

    Workflow:
    1. Validation: Geocode address, verify type == "house"
    2. Parallel workflows:
       - Workflow 1: Interest rate lookup
       - Workflow 2: Boundary analysis (bbox + polygon)
       - Workflow 3: Property data (info, tax, sales, apartment comps)
    """

    def __init__(
        self,
        perplexity_client: PerplexityClient,
        rentcast_client: RentcastClient,
        gemini_client: GeminiClient,
        config: Optional[WorkflowConfig] = None
    ):
        self.perplexity_client = perplexity_client
        self.rentcast_client = rentcast_client
        self.gemini_client = gemini_client
        self.config = config or WorkflowConfig()
        self.state: Optional[WorkflowState] = None
        # Store boundary expansion data for potential use in post-processing
        self._boundary_expansion_data: Optional[Dict[str, Any]] = None
        self._target_coords: Optional[Tuple[float, float]] = None
        # Callback for step completion notifications (used for async job updates)
        self._on_step_complete: Optional[Callable[[str], None]] = None

    def _notify_step_complete(self, step_name: str) -> None:
        """Notify external listener of step completion."""
        if self._on_step_complete:
            try:
                self._on_step_complete(step_name)
            except Exception as e:
                logger.warning(f"Step notification failed for {step_name}: {e}")

    def execute(
        self,
        input_data: Dict[str, Any],
        on_step_complete: Optional[Callable[[str], None]] = None
    ) -> Dict[str, Any]:
        """Execute the complete workflow.

        Args:
            input_data: Address data with street, city, state, zip
            on_step_complete: Optional callback called after each step completes.
                              Receives the step name as a string.
        """
        # Store callback for use in step methods
        self._on_step_complete = on_step_complete

        workflow_start_time = datetime.utcnow().isoformat() + "Z"
        start_time = time.time()

        # Parse and validate input
        try:
            workflow_input = NewRentalWorkflowInput(**input_data)
        except Exception as e:
            return self._build_error_response(f"Invalid input: {str(e)}", workflow_start_time, start_time)

        # Initialize state
        self.state = WorkflowState(input_data=workflow_input, config=self.config, start_time=start_time)

        log_workflow_start({
            'street': workflow_input.street,
            'city': workflow_input.city,
            'state': workflow_input.state,
            'zip': workflow_input.zip
        }, 'new_rental_workflow', logger)

        # Step 1: Validation
        geocode_result = self._execute_validation(workflow_input)
        if not geocode_result:
            return self._build_output(workflow_start_time)

        lat, lon = geocode_result['lat'], geocode_result['lon']

        # Step 2: Parallel Workflows
        logger.info("Starting parallel workflows")
        with ThreadPoolExecutor(max_workers=3) as executor:
            futures = {
                executor.submit(self._execute_interest_rate_workflow, workflow_input.state): 'interest_rate',
                executor.submit(self._execute_boundary_workflow, lat, lon): 'boundary_analysis',
                executor.submit(self._execute_property_data_workflow, workflow_input, lat, lon): 'property_data'
            }
            for future in as_completed(futures):
                workflow_name = futures[future]
                try:
                    future.result()
                    logger.info(f"Workflow {workflow_name} completed")
                except Exception as e:
                    logger.error(f"Workflow {workflow_name} failed: {e}", exc_info=True)

        # Step 3: Post-Processing (filter by polygon + calculate summaries)
        self._execute_post_processing()

        return self._build_output(workflow_start_time)

    # =========================================================================
    # Step 1: Validation
    # =========================================================================

    def _execute_validation(self, input_data: NewRentalWorkflowInput) -> Optional[Dict[str, float]]:
        """Execute validation step: geocode and verify type."""
        step_start = time.time()

        try:
            result = get_coordinates({
                'street': input_data.street,
                'city': input_data.city,
                'state': input_data.state,
                'zip': input_data.zip
            })

            if not result.success:
                self.state.fail_step(WorkflowStep.VALIDATION, result.error or "Geocoding failed",
                                     result.error_code or ErrorCode.API_ERROR, 1, step_start)
                return None

            address_type = result.data.get('type', '')
            if address_type != 'house':
                self.state.fail_step(WorkflowStep.VALIDATION, f"Address type '{address_type}' is not 'house'",
                                     ErrorCode.VALIDATION_ERROR, 1, step_start)
                return None

            lat_raw, lon_raw = result.data.get('lat'), result.data.get('lon')
            if lat_raw is None or lon_raw is None:
                self.state.fail_step(WorkflowStep.VALIDATION, "Geocoding returned no coordinates",
                                     ErrorCode.MISSING_REQUIRED_FIELD, 1, step_start)
                return None

            lat, lon = float(lat_raw), float(lon_raw)
            if lat == 0.0 and lon == 0.0:
                self.state.fail_step(WorkflowStep.VALIDATION, "Geocoding returned invalid coordinates (0,0)",
                                     ErrorCode.INVALID_COORDINATES, 1, step_start)
                return None

            # Store geocoding data
            self.state.data.geocoding = GeocodingData(
                lat=lat, lon=lon, type=address_type,
                osm_type=result.data.get('osm_type', ''),
                osm_id=int(result.data.get('osm_id', 0)) if result.data.get('osm_id') else 0,
                display_name=result.data.get('display_name', ''),
                address=result.data.get('address', {}),
                boundingbox=result.data.get('boundingbox', [])
            )

            self.state.complete_step(WorkflowStep.VALIDATION, {'lat': lat, 'lon': lon, 'type': address_type},
                                     'nominatim', 1, step_start)
            self._notify_step_complete('validation')
            return {'lat': lat, 'lon': lon}

        except Exception as e:
            logger.error(f"Validation error: {e}", exc_info=True)
            self.state.fail_step(WorkflowStep.VALIDATION, str(e), ErrorCode.INTERNAL_ERROR, 1, step_start)
            return None

    # =========================================================================
    # Workflow 1: Interest Rate
    # =========================================================================

    def _execute_interest_rate_workflow(self, state: str) -> None:
        """Execute interest rate lookup workflow."""
        step_start = time.time()

        try:
            result = get_interest_rate({
                'state_name': state,
                'down_payment': self.config.default_down_payment,
                'loan_type': self.config.default_loan_type
            }, self.perplexity_client)

            if result.success and result.data:
                self.state.data.interest_rate = InterestRateData(
                    interest_rate=result.data.get('interest_rate', 0),
                    state=state,
                    loan_type=self.config.default_loan_type,
                    down_payment=self.config.default_down_payment
                )
                self.state.complete_step(WorkflowStep.INTEREST_RATE, result.data, 'perplexity', 1, step_start)
                self._notify_step_complete('interest_rate')
            else:
                self.state.fail_step(WorkflowStep.INTEREST_RATE, result.error or "Failed to get interest rate",
                                     result.error_code or ErrorCode.API_ERROR, 1, step_start)

        except Exception as e:
            logger.error(f"Interest rate workflow error: {e}", exc_info=True)
            self.state.fail_step(WorkflowStep.INTEREST_RATE, str(e), ErrorCode.INTERNAL_ERROR, 1, step_start)

    # =========================================================================
    # Workflow 2: Boundary Analysis
    # =========================================================================

    def _execute_boundary_workflow(self, lat: float, lon: float) -> None:
        """Execute boundary analysis workflow (radius bbox + polygon)."""
        step_start = time.time()
        api_calls = 0

        try:
            # Store target coordinates for potential expansion
            self._target_coords = (lon, lat)  # Note: lon, lat order for GeoJSON

            # Calculate radius bounding box
            radius_bbox = calculate_radius_bbox(lat, lon, self.config.search_radius_miles)
            self.state.data.bounding_boxes = BoundingBoxData(
                radius_bbox=radius_bbox,
                radius_miles=self.config.search_radius_miles
            )

            # Fetch OSM ways
            osm_result = fetch_osm_ways({'bbox': radius_bbox})
            api_calls += 1

            if not osm_result.success:
                # Partial success - have bounding box but no polygon
                self.state.complete_step(WorkflowStep.BOUNDARY_ANALYSIS,
                                         {'bounding_boxes': self.state.data.bounding_boxes.model_dump(),
                                          'polygon_error': osm_result.error},
                                         'overpass', api_calls, step_start)
                return

            # Build polygon with expansion support enabled
            polygon_result = build_boundary_polygon(
                osm_result.data.get('ways', []),
                radius_bbox,
                (lon, lat),  # Note: lon, lat order for GeoJSON
                enable_expansion=self.config.enable_polygon_expansion
            )

            if polygon_result.success and polygon_result.data:
                # Store expansion data for potential use in post-processing
                if self.config.enable_polygon_expansion:
                    self._boundary_expansion_data = polygon_result.data

                self.state.data.boundary_polygon = PolygonData(
                    polygon=polygon_result.data.get('polygon'),
                    osm_ways_count=len(osm_result.data.get('ways', [])),
                    polygon_area_sq_degrees=polygon_result.data.get('polygon', {}).get('properties', {}).get('area_sq_degrees'),
                    construction_method='intersection_based',
                    selected_polygon_idx=polygon_result.data.get('selected_polygon_idx'),
                    total_polygons_found=polygon_result.data.get('total_polygons_found')
                )

            self.state.complete_step(WorkflowStep.BOUNDARY_ANALYSIS, {
                'bounding_boxes': self.state.data.bounding_boxes.model_dump() if self.state.data.bounding_boxes else None,
                'polygon': self.state.data.boundary_polygon.model_dump() if self.state.data.boundary_polygon else None
            }, 'overpass', api_calls, step_start)
            self._notify_step_complete('boundary_analysis')

        except Exception as e:
            logger.error(f"Boundary analysis error: {e}", exc_info=True)
            self.state.fail_step(WorkflowStep.BOUNDARY_ANALYSIS, str(e), ErrorCode.INTERNAL_ERROR, api_calls, step_start)

    # =========================================================================
    # Workflow 3: Property Data
    # =========================================================================

    def _execute_property_data_workflow(self, input_data: NewRentalWorkflowInput, lat: float, lon: float) -> None:
        """Execute property data workflow with sub-steps."""
        # Step 3a: Property info (must complete first)
        property_type, unit_data = self._execute_property_info(input_data, lat, lon)

        if property_type is None:
            logger.warning("property_info failed, skipping dependent steps")
            self.state.skip_step(WorkflowStep.SALES_DATA, 'Skipped: property_info failed', 'property_info')
            return

        if unit_data is None:
            logger.warning("property_info returned no unit_data, skipping apartment_comps")
            self._execute_sales_data(property_type, input_data.zip, lat, lon)
            return

        # Steps 3b and 3c can run in parallel
        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [
                executor.submit(self._execute_sales_data, property_type, input_data.zip, lat, lon),
                executor.submit(self._execute_apartment_comps, lat, lon, unit_data,
                                input_data.city, input_data.state, input_data.street, input_data.zip)
            ]
            for future in as_completed(futures):
                try:
                    future.result()
                except Exception as e:
                    logger.error(f"Property data sub-workflow error: {e}", exc_info=True)

    # =========================================================================
    # Step 3a: Property Info
    # =========================================================================

    def _execute_property_info(self, input_data: NewRentalWorkflowInput, lat: float, lon: float) -> Tuple[Optional[str], Optional[List[Dict]]]:
        """Execute property info lookup. Returns (property_type, unit_data) or (None, None) on failure."""
        step_start = time.time()
        api_calls = 0

        try:
            # Try Rentcast first
            formatted_address = f"{input_data.street}, {input_data.city}, {input_data.state} {input_data.zip}"
            rentcast_result = get_rentcast_property_records({'address': formatted_address}, self.rentcast_client)
            api_calls += 1

            if rentcast_result.success and rentcast_result.data.get('properties'):
                return self._process_rentcast_property(rentcast_result.data['properties'][0], input_data, api_calls, step_start)

            # Fallback to Gemini
            logger.info("Rentcast failed, falling back to Gemini")
            return self._execute_property_info_gemini(input_data, api_calls, step_start)

        except Exception as e:
            logger.error(f"Property info error: {e}", exc_info=True)
            self.state.fail_step(WorkflowStep.PROPERTY_INFO, str(e), ErrorCode.INTERNAL_ERROR, api_calls, step_start)
            return None, None

    def _process_rentcast_property(self, property_data: Dict, input_data: NewRentalWorkflowInput,
                                    api_calls: int, step_start: float) -> Tuple[Optional[str], Optional[List[Dict]]]:
        """Process Rentcast property data."""
        property_type = property_data.get('propertyType')

        if not property_type:
            logger.warning("Rentcast missing propertyType, falling back to Gemini")
            return self._execute_property_info_gemini(input_data, api_calls, step_start)

        property_info = PropertyInfoData(
            source='rentcast',
            property_type=property_type,
            formatted_address=property_data.get('formattedAddress'),
            latitude=property_data.get('latitude'),
            longitude=property_data.get('longitude'),
            year_built=property_data.get('yearBuilt'),
            lot_size=property_data.get('lotSize'),
            bedrooms=property_data.get('bedrooms'),
            bathrooms=property_data.get('bathrooms'),
            square_footage=property_data.get('squareFootage'),
            raw_data=property_data
        )

        # Handle Multi-Family vs Single Family
        if property_type == 'Multi-Family':
            unit_data = self._get_multi_family_units(input_data, property_info, api_calls, step_start)
            if unit_data is None:
                return None, None
        else:
            unit_data = self._get_single_family_unit(property_data, input_data, api_calls, step_start)
            if unit_data is None:
                return None, None
            property_info.total_units = 1
            property_info.units = [UnitData(**unit_data[0])]

        # Handle property tax from Rentcast (propertyTaxes is a dict keyed by year)
        self._extract_rentcast_tax(property_data.get('propertyTaxes', {}), input_data)

        self.state.data.property_info = property_info
        self.state.complete_step(WorkflowStep.PROPERTY_INFO, property_info.model_dump(), 'rentcast', api_calls, step_start)
        self._notify_step_complete('property_info')
        return property_type, unit_data

    def _get_multi_family_units(self, input_data: NewRentalWorkflowInput, property_info: PropertyInfoData,
                                 api_calls: int, step_start: float) -> Optional[List[Dict]]:
        """Get unit breakdown for multi-family property via Gemini with grounded search."""
        county = self.state.data.geocoding.address.get('county', '') if self.state.data.geocoding else ''
        county_name = county.replace(' County', '') if county else input_data.city

        unit_result = get_initial_property_info_gemini({
            'street': input_data.street, 'city': input_data.city,
            'state': input_data.state, 'zip': input_data.zip, 'county_name': county_name
        }, self.gemini_client)
        api_calls += 1

        if not unit_result.success or not unit_result.data:
            error_detail = unit_result.error or "No data returned"
            logger.error(f"Multi-family unit breakdown failed: {error_detail}")
            self.state.fail_step(WorkflowStep.PROPERTY_INFO, f"Multi-family: failed to retrieve unit breakdown - {error_detail}",
                                 unit_result.error_code or ErrorCode.MISSING_REQUIRED_FIELD, api_calls, step_start)
            return None

        unit_beds = unit_result.data.get('unit_bed', [])
        unit_baths = unit_result.data.get('unit_bath', [])
        unit_sqft = unit_result.data.get('unit_sq_ft', [])

        if not unit_beds or not unit_baths or not unit_sqft:
            self.state.fail_step(WorkflowStep.PROPERTY_INFO, "Multi-family: missing unit breakdown data",
                                 ErrorCode.MISSING_REQUIRED_FIELD, api_calls, step_start)
            return None

        total_units = unit_result.data.get('total_units') or len(unit_beds)
        property_info.total_units = total_units
        property_info.units = [
            UnitData(beds=unit_beds[i], baths=unit_baths[i], sqft=unit_sqft[i])
            for i in range(min(len(unit_beds), len(unit_baths), len(unit_sqft)))
        ]

        return [{'beds': unit_beds[i], 'baths': unit_baths[i], 'sqft': unit_sqft[i]}
                for i in range(min(len(unit_beds), len(unit_baths), len(unit_sqft)))]

    def _get_single_family_unit(self, property_data: Dict, input_data: NewRentalWorkflowInput,
                                 api_calls: int, step_start: float) -> Optional[List[Dict]]:
        """Get unit data for single family property."""
        beds = property_data.get('bedrooms')
        baths = property_data.get('bathrooms')
        sqft = property_data.get('squareFootage')

        missing = [f for f, v in [('bedrooms', beds), ('bathrooms', baths), ('squareFootage', sqft)] if v is None]
        if missing:
            logger.warning(f"Rentcast missing fields: {missing}, falling back to Perplexity")
            return None  # Will trigger Perplexity fallback

        return [{'beds': beds, 'baths': baths, 'sqft': sqft}]

    def _extract_rentcast_tax(self, property_taxes: Dict[str, Dict], input_data: NewRentalWorkflowInput) -> None:
        """Extract property tax from Rentcast data or fallback to Perplexity.

        Rentcast propertyTaxes is an object keyed by year, e.g.:
        {"2024": {"year": 2024, "total": 4065}, "2023": {"year": 2023, "total": 3950}}
        """
        if property_taxes and isinstance(property_taxes, dict):
            # Convert dict values to list and sort by year descending
            tax_entries = list(property_taxes.values())
            sorted_taxes = sorted(tax_entries, key=lambda x: x.get('year', 0) if isinstance(x, dict) else 0, reverse=True)
            if sorted_taxes and isinstance(sorted_taxes[0], dict) and sorted_taxes[0].get('total'):
                self.state.data.property_tax = PropertyTaxData(
                    annual_taxes=sorted_taxes[0]['total'],
                    tax_year=sorted_taxes[0].get('year'),
                    source='rentcast'
                )
                self.state.complete_step(WorkflowStep.PROPERTY_TAX,
                                         {'annual_taxes': sorted_taxes[0]['total'], 'year': sorted_taxes[0].get('year')},
                                         'rentcast', 0, time.time())
                self._notify_step_complete('property_tax')
                return

        # Fallback to Perplexity for property tax
        self._execute_property_tax_perplexity(input_data)

    def _execute_property_info_gemini(self, input_data: NewRentalWorkflowInput,
                                        prior_api_calls: int, step_start: float) -> Tuple[Optional[str], Optional[List[Dict]]]:
        """Fallback to Gemini for property info (with Perplexity for tax)."""
        county = self.state.data.geocoding.address.get('county', '') if self.state.data.geocoding else ''
        county_name = county.replace(' County', '') if county else input_data.city
        tax_year = datetime.now().year - 1

        # Run property info (Gemini) and tax (Perplexity) in parallel
        with ThreadPoolExecutor(max_workers=2) as executor:
            details_future = executor.submit(get_initial_property_info_gemini, {
                'street': input_data.street, 'city': input_data.city,
                'state': input_data.state, 'zip': input_data.zip, 'county_name': county_name
            }, self.gemini_client)

            tax_future = executor.submit(get_property_tax, {
                'street': input_data.street, 'city': input_data.city,
                'state': input_data.state, 'zip': input_data.zip, 'year': tax_year
            }, self.perplexity_client)

            details_result = details_future.result()
            prior_api_calls += 1

            property_type, unit_data = None, None

            if details_result.success and details_result.data:
                unit_beds = details_result.data.get('unit_bed', [])
                unit_baths = details_result.data.get('unit_bath', [])
                unit_sqft = details_result.data.get('unit_sq_ft', [])

                if unit_beds and unit_baths and unit_sqft:
                    total_units = details_result.data.get('total_units') or len(unit_beds)
                    property_type = "Multi-Family" if total_units > 1 else "Single Family"

                    property_info = PropertyInfoData(
                        source='gemini',
                        property_type=property_type,
                        bedrooms=sum(unit_beds),
                        bathrooms=sum(unit_baths),
                        square_footage=sum(unit_sqft),
                        total_units=total_units,
                        units=[UnitData(beds=unit_beds[i], baths=unit_baths[i], sqft=unit_sqft[i])
                               for i in range(min(len(unit_beds), len(unit_baths), len(unit_sqft)))]
                    )

                    unit_data = [{'beds': unit_beds[i], 'baths': unit_baths[i], 'sqft': unit_sqft[i]}
                                 for i in range(min(len(unit_beds), len(unit_baths), len(unit_sqft)))]

                    self.state.data.property_info = property_info
                    self.state.complete_step(WorkflowStep.PROPERTY_INFO, property_info.model_dump(),
                                             'gemini', prior_api_calls, step_start)
                    self._notify_step_complete('property_info')
                else:
                    self.state.fail_step(WorkflowStep.PROPERTY_INFO, "Gemini returned incomplete data",
                                         ErrorCode.MISSING_REQUIRED_FIELD, prior_api_calls, step_start)
            else:
                self.state.fail_step(WorkflowStep.PROPERTY_INFO, details_result.error or "Gemini failed",
                                     details_result.error_code or ErrorCode.API_ERROR, prior_api_calls, step_start)

            # Handle tax result (still uses Perplexity)
            tax_result = tax_future.result()
            prior_api_calls += 1

            if tax_result.success and tax_result.data and tax_result.data.get('annual_taxes') is not None:
                self.state.data.property_tax = PropertyTaxData(
                    annual_taxes=tax_result.data['annual_taxes'],
                    tax_year=tax_year,
                    source='perplexity'
                )
                self.state.complete_step(WorkflowStep.PROPERTY_TAX, tax_result.data, 'perplexity', 1, time.time())
                self._notify_step_complete('property_tax')
            else:
                self.state.fail_step(WorkflowStep.PROPERTY_TAX, tax_result.error or "Failed to get property tax",
                                     tax_result.error_code or ErrorCode.API_ERROR, 1, time.time())

        return property_type, unit_data

    def _execute_property_tax_perplexity(self, input_data: NewRentalWorkflowInput) -> None:
        """Fallback to Perplexity for property tax."""
        step_start = time.time()
        tax_year = datetime.now().year - 1

        try:
            result = get_property_tax({
                'street': input_data.street, 'city': input_data.city,
                'state': input_data.state, 'zip': input_data.zip, 'year': tax_year
            }, self.perplexity_client)

            if result.success and result.data and result.data.get('annual_taxes') is not None:
                self.state.data.property_tax = PropertyTaxData(
                    annual_taxes=result.data['annual_taxes'],
                    tax_year=tax_year,
                    source='perplexity'
                )
                self.state.complete_step(WorkflowStep.PROPERTY_TAX, result.data, 'perplexity', 1, step_start)
                self._notify_step_complete('property_tax')
            else:
                self.state.fail_step(WorkflowStep.PROPERTY_TAX, result.error or "No annual_taxes returned",
                                     result.error_code or ErrorCode.MISSING_REQUIRED_FIELD, 1, step_start)

        except Exception as e:
            logger.error(f"Property tax fallback error: {e}", exc_info=True)
            self.state.fail_step(WorkflowStep.PROPERTY_TAX, str(e), ErrorCode.INTERNAL_ERROR, 1, step_start)

    # =========================================================================
    # Step 3b: Sales Data
    # =========================================================================

    def _execute_sales_data(self, property_type: str, zip_code: str, lat: float, lon: float) -> None:
        """Execute sales data lookup."""
        step_start = time.time()
        api_calls = 0

        try:
            # Try Gemini first
            gemini_result = get_recent_property_sales({
                'propertyType': property_type,
                'zipCode': zip_code,
                'timePeriod': self.config.sales_time_period
            }, self.gemini_client)
            api_calls += 1

            if gemini_result.success and gemini_result.data.get('addresses'):
                sales_data = self._process_gemini_sales(gemini_result.data, zip_code)
                api_calls += len(gemini_result.data.get('addresses', []))
                self.state.data.sales_data = sales_data
                self.state.complete_step(WorkflowStep.SALES_DATA, sales_data.model_dump(), 'gemini', api_calls, step_start)
                self._notify_step_complete('sales_data')
                return

            # Fallback to Rentcast
            logger.info("Gemini sales failed, falling back to Rentcast")
            rentcast_result = get_rentcast_sale_listings({
                'latitude': lat, 'longitude': lon,
                'radius': self.config.search_radius_miles,
                'property_type': property_type
            }, self.rentcast_client)
            api_calls += 1

            if rentcast_result.success and rentcast_result.data.get('listings'):
                sales_data = self._process_rentcast_sales(rentcast_result.data['listings'])
                self.state.data.sales_data = sales_data
                self.state.complete_step(WorkflowStep.SALES_DATA, sales_data.model_dump(), 'rentcast', api_calls, step_start)
                self._notify_step_complete('sales_data')
            else:
                self.state.fail_step(WorkflowStep.SALES_DATA, "No sales data found",
                                     ErrorCode.NO_DATA, api_calls, step_start)

        except Exception as e:
            logger.error(f"Sales data error: {e}", exc_info=True)
            self.state.fail_step(WorkflowStep.SALES_DATA, str(e), ErrorCode.INTERNAL_ERROR, api_calls, step_start)

    def _parse_full_address(self, full_address: str) -> Dict[str, str]:
        """
        Parse a full address string into components.

        Expected format: "3414 W 94th St, Cleveland, OH 44102"
        Returns: {'street': '3414 W 94th St', 'city': 'Cleveland', 'state': 'OH', 'zip': '44102'}
        """
        parts = [p.strip() for p in full_address.split(',')]

        if len(parts) >= 3:
            # Format: "street, city, state zip"
            street = parts[0]
            city = parts[1]
            # Last part is "state zip" like "OH 44102"
            state_zip = parts[2].split()
            state = state_zip[0] if state_zip else ''
            zip_code = state_zip[1] if len(state_zip) > 1 else ''
            return {'street': street, 'city': city, 'state': state, 'zip': zip_code}
        elif len(parts) == 2:
            # Format: "street, city state zip"
            street = parts[0]
            city_state_zip = parts[1].split()
            city = city_state_zip[0] if city_state_zip else ''
            state = city_state_zip[1] if len(city_state_zip) > 1 else ''
            zip_code = city_state_zip[2] if len(city_state_zip) > 2 else ''
            return {'street': street, 'city': city, 'state': state, 'zip': zip_code}
        else:
            # Can't parse, return as street only
            return {'street': full_address, 'city': '', 'state': '', 'zip': ''}

    def _process_gemini_sales(self, data: Dict, zip_code: str) -> SalesData:
        """Process Gemini sales data with geocoding."""
        addresses = data.get('addresses', [])
        sale_dates = data.get('saleDate', [])
        sale_prices = data.get('salePrice', [])
        sq_footages = data.get('sqFootage', [])

        logger.info(f"Processing {len(addresses)} Gemini sales addresses for geocoding")

        # Parse full addresses into components for geocoding
        # Gemini returns addresses like "4706 Franklin Blvd, Cleveland, OH 44102"
        addresses_to_geocode = [self._parse_full_address(addr) for addr in addresses]
        geocoded = batch_geocode_addresses(addresses_to_geocode)

        # Log geocoding results summary
        successful = sum(1 for g in geocoded if g.success)
        logger.info(f"Geocoding complete: {successful}/{len(geocoded)} successful")

        entries = []
        for i, addr in enumerate(addresses):
            # Extract lat/lon from geocoding result if successful
            lat = None
            lon = None
            if i < len(geocoded):
                geo_result = geocoded[i]
                if geo_result.success and geo_result.data:
                    lat_str = geo_result.data.get('lat')
                    lon_str = geo_result.data.get('lon')
                    if lat_str:
                        lat = float(lat_str)
                    if lon_str:
                        lon = float(lon_str)
                    logger.debug(f"Geocoded '{addr}': lat={lat}, lon={lon}")
                else:
                    logger.warning(f"Geocoding failed for '{addr}': {geo_result.error}")

            entry = SalesDataEntry(
                address=addr,
                sale_date=sale_dates[i] if i < len(sale_dates) else None,
                sale_price=sale_prices[i] if i < len(sale_prices) else None,
                sqft=sq_footages[i] if i < len(sq_footages) else None,
                lat=lat,
                lon=lon
            )
            entries.append(entry)

        return SalesData(source='gemini', sales=entries, total_count=len(entries))

    def _process_rentcast_sales(self, listings: List[Dict]) -> SalesData:
        """Process Rentcast sales listings."""
        entries = [
            SalesDataEntry(
                address=listing.get('formattedAddress', ''),
                sale_price=listing.get('price'),
                sqft=listing.get('squareFootage'),
                lat=listing.get('latitude'),
                lon=listing.get('longitude')
            )
            for listing in listings
        ]
        return SalesData(source='rentcast', sales=entries, total_count=len(entries))

    # =========================================================================
    # Step 3c: Apartment Comps
    # =========================================================================

    def _execute_apartment_comps(self, lat: float, lon: float, unit_data: List[Dict],
                                  city: str, state: str, street: str, zip_code: str) -> None:
        """Execute apartment comps for each unit type."""
        if not unit_data:
            return

        unique_units = self._get_unique_unit_types(unit_data)
        if not unique_units:
            return

        apartment_comps = {}
        with ThreadPoolExecutor(max_workers=min(len(unique_units), 4)) as executor:
            futures = {
                executor.submit(self._execute_single_apartment_comp, lat, lon, unit, city, state, street, zip_code):
                f"{unit['beds']}bd_{unit['baths']}ba"
                for unit in unique_units
            }
            for future in as_completed(futures):
                unit_key = futures[future]
                try:
                    result = future.result()
                    if result:
                        apartment_comps[unit_key] = result
                except Exception as e:
                    logger.error(f"Apartment comp error for {unit_key}: {e}", exc_info=True)

        self.state.data.apartment_comps = apartment_comps

    def _get_unique_unit_types(self, unit_data: List[Dict]) -> List[Dict]:
        """Get unique unit types by beds/baths combination."""
        seen = set()
        unique = []
        for unit in unit_data:
            key = (unit.get('beds', 0), unit.get('baths', 0))
            if key not in seen:
                seen.add(key)
                unique.append(unit)
        return unique

    def _execute_single_apartment_comp(self, lat: float, lon: float, unit: Dict,
                                        city: str, state: str, street: str, zip_code: str) -> Optional[ApartmentCompData]:
        """Execute apartment comp search for a single unit type."""
        step_start = time.time()
        api_calls = 0

        beds, baths, sqft = unit.get('beds'), unit.get('baths'), unit.get('sqft')
        if beds is None or baths is None or sqft is None:
            unit_key = f"{beds or '?'}bd_{baths or '?'}ba"
            self.state.fail_apartment_comp(unit_key, "Missing required unit fields",
                                           ErrorCode.MISSING_REQUIRED_FIELD, 0, step_start)
            return None

        unit_key = f"{beds}bd_{baths}ba"

        try:
            # Try Rentcast first
            rentcast_result = get_rentcast_rental_listings({
                'latitude': lat, 'longitude': lon,
                'radius': self.config.search_radius_miles,
                'bedrooms': str(beds), 'bathrooms': str(baths),
                'limit': 500
            }, self.rentcast_client)
            api_calls += 1

            if rentcast_result.success and rentcast_result.data.get('listings'):
                comp_data = self._process_rentcast_comps(rentcast_result.data['listings'], beds, baths, sqft)
                self.state.complete_apartment_comp(unit_key, comp_data.model_dump(), 'rentcast', api_calls, step_start)
                self._notify_step_complete(f'apartment_comps_{unit_key}')
                return comp_data

            # Fallback to Perplexity
            logger.info(f"Rentcast rental failed for {unit_key}, falling back to Perplexity")
            return self._execute_apartment_comp_perplexity(beds, baths, sqft, city, state, street, zip_code,
                                                           unit_key, step_start, api_calls)

        except Exception as e:
            logger.error(f"Apartment comp error for {unit_key}: {e}", exc_info=True)
            self.state.fail_apartment_comp(unit_key, str(e), ErrorCode.INTERNAL_ERROR, api_calls, step_start)
            return None

    def _process_rentcast_comps(self, listings: List[Dict], beds: int, baths: int, sqft: int) -> ApartmentCompData:
        """Process Rentcast rental listings."""
        entries = [
            ApartmentCompEntry(
                address=listing.get('formattedAddress', ''),
                rent=listing.get('price'),
                bedrooms=listing.get('bedrooms'),
                bathrooms=listing.get('bathrooms'),
                sqft=listing.get('squareFootage'),
                lat=listing.get('latitude'),
                lon=listing.get('longitude')
            )
            for listing in listings
        ]
        return ApartmentCompData(source='rentcast', unit_beds=beds, unit_baths=baths,
                                 unit_sqft=sqft, listings=entries, total_count=len(entries))

    def _execute_apartment_comp_perplexity(self, beds: int, baths: int, sqft: int,
                                            city: str, state: str, street: str, zip_code: str,
                                            unit_key: str, step_start: float, api_calls: int) -> Optional[ApartmentCompData]:
        """Fallback to Perplexity for apartment comps."""
        try:
            neighborhood = None
            if is_valid_city(city):
                neighborhood_result = get_neighborhood_name({
                    'street': street, 'city': city, 'state': state, 'zip': zip_code
                }, self.perplexity_client)
                api_calls += 1
                if neighborhood_result.success and neighborhood_result.data:
                    neighborhood = neighborhood_result.data.get('neighborhood')

            apartment_result = get_apartment_comps({
                'city': city, 'state': state,
                'bed_count': beds, 'bath_count': baths, 'neighborhood': neighborhood
            }, self.perplexity_client)
            api_calls += 1

            if apartment_result.success and apartment_result.data.get('addresses'):
                addresses = apartment_result.data['addresses']
                addresses_to_geocode = [{'street': addr, 'city': city, 'state': state, 'zip': ''} for addr in addresses]
                geocoded = batch_geocode_addresses(addresses_to_geocode)
                api_calls += len(addresses)

                entries = []
                for i, addr in enumerate(addresses):
                    entry = ApartmentCompEntry(address=addr, bedrooms=beds, bathrooms=baths)
                    if i < len(geocoded) and geocoded[i].success:
                        entry.lat = float(geocoded[i].data.get('lat', 0))
                        entry.lon = float(geocoded[i].data.get('lon', 0))
                    entries.append(entry)

                comp_data = ApartmentCompData(source='perplexity', unit_beds=beds, unit_baths=baths,
                                              unit_sqft=sqft, listings=entries, total_count=len(entries))
                self.state.complete_apartment_comp(unit_key, comp_data.model_dump(), 'perplexity', api_calls, step_start)
                self._notify_step_complete(f'apartment_comps_{unit_key}')
                return comp_data

            self.state.fail_apartment_comp(unit_key, "No apartment comps found", ErrorCode.NO_DATA, api_calls, step_start)
            return None

        except Exception as e:
            logger.error(f"Apartment comp fallback error: {e}", exc_info=True)
            self.state.fail_apartment_comp(unit_key, str(e), ErrorCode.INTERNAL_ERROR, api_calls, step_start)
            return None

    # =========================================================================
    # Step 4: Post-Processing (Polygon Filtering + Five-Number Summary)
    # =========================================================================

    def _execute_post_processing(self) -> None:
        """Execute post-processing: filter addresses by polygon and calculate summaries.

        Each data type (sales_data and each apartment comp type) is filtered independently.
        If a filtered count is below the threshold, that specific data type's polygon
        is expanded independently of others.
        """
        step_start = time.time()

        # Check if polygon is available
        if not self.state.data.boundary_polygon or not self.state.data.boundary_polygon.polygon:
            logger.warning("No polygon available for filtering, skipping formatted output")
            self.state.skip_step(WorkflowStep.FORMATTED_OUTPUT, 'No polygon available', 'boundary_analysis')
            return

        original_polygon = self.state.data.boundary_polygon.polygon
        formatted_output = FormattedOutput()

        try:
            # Build input property info from all collected data
            formatted_output.input_property = self._build_input_property_info()

            # Filter and analyze sales data (with independent expansion)
            if self.state.data.sales_data and self.state.data.sales_data.sales:
                formatted_output.sales_data = self._filter_sales_with_expansion(original_polygon)
                logger.info(f"Sales data: {formatted_output.sales_data.filtered_count}/{formatted_output.sales_data.original_count} "
                           f"(expanded: {formatted_output.sales_data.is_expanded})")

            # Filter and analyze apartment comps - EACH TYPE INDEPENDENTLY
            if self.state.data.apartment_comps:
                formatted_output.apartment_comps = {}
                for unit_key, comp_data in self.state.data.apartment_comps.items():
                    filtered = self._filter_apartment_comp_with_expansion(original_polygon, unit_key, comp_data)
                    if filtered:
                        formatted_output.apartment_comps[unit_key] = filtered
                        logger.info(f"Apartment comps {unit_key}: {filtered.filtered_count}/{filtered.original_count} "
                                   f"(expanded: {filtered.is_expanded})")

            self.state.data.formatted_output = formatted_output
            self.state.complete_step(WorkflowStep.FORMATTED_OUTPUT,
                                     formatted_output.model_dump(),
                                     'internal', 0, step_start)
            self._notify_step_complete('formatted_output')

        except Exception as e:
            logger.error(f"Post-processing error: {e}", exc_info=True)
            self.state.fail_step(WorkflowStep.FORMATTED_OUTPUT, str(e), ErrorCode.INTERNAL_ERROR, 0, step_start)

    def _filter_sales_with_expansion(self, original_polygon: Dict) -> FilteredSalesData:
        """
        Filter sales data with independent expansion logic.

        If filtered count < threshold and expansion is enabled, expands polygon
        and re-filters. Supports tier 3 expansion through primary roads if data
        is still insufficient after tier 1-2.
        """
        # First pass: filter against original polygon
        filtered_result = self._filter_and_analyze_sales(original_polygon)

        # Check if expansion is needed for THIS data type
        if (self.config.enable_polygon_expansion and
            filtered_result.filtered_count < self.config.min_data_for_analysis and
            self._boundary_expansion_data is not None and
            self._target_coords is not None):

            logger.info(f"Sales data: {filtered_result.filtered_count} in polygon "
                       f"(minimum: {self.config.min_data_for_analysis}), attempting tier 1-2 expansion")

            # Phase 1: Tier 1-2 expansion (soft boundaries only)
            expanded_polygon, expansion_metadata = self._try_expand_polygon_independent(
                enable_tier_three=False
            )

            if expanded_polygon and expansion_metadata:
                # Re-filter with tier 1-2 expanded polygon
                filtered_result = self._filter_and_analyze_sales(expanded_polygon)
                filtered_result.is_expanded = True

                # Phase 2: Check if tier 3 is needed
                if filtered_result.filtered_count <= self.config.min_data_for_tier_three:
                    logger.info(f"Sales data after tier 1-2: {filtered_result.filtered_count} "
                               f"(<= {self.config.min_data_for_tier_three}), attempting tier 3 expansion")

                    # Try tier 3 expansion (crosses primary roads)
                    tier3_polygon, tier3_metadata = self._try_expand_polygon_independent(
                        enable_tier_three=True,
                        current_data_count=filtered_result.filtered_count
                    )

                    if tier3_polygon and tier3_metadata and tier3_metadata.get('tier_three_triggered'):
                        # Re-filter with tier 3 expanded polygon
                        filtered_result = self._filter_and_analyze_sales(tier3_polygon)
                        expansion_metadata = tier3_metadata
                        logger.info(f"Sales data after tier 3: {filtered_result.filtered_count}")

                filtered_result.expansion_metadata = PolygonExpansionMetadata(
                    original_area_sq_degrees=expansion_metadata.get('original_area_sq_degrees', 0),
                    expanded_area_sq_degrees=expansion_metadata.get('expanded_area_sq_degrees', 0),
                    expansion_tiers_used=expansion_metadata.get('expansion_tiers_used', 0),
                    included_polygon_count=expansion_metadata.get('included_polygon_count', 1),
                    included_polygon_indices=expansion_metadata.get('included_polygon_indices', []),
                    expansion_reason='insufficient_sales_data',
                    tier_three_triggered=expansion_metadata.get('tier_three_triggered', False)
                )
                logger.info(f"Sales data after expansion: {filtered_result.filtered_count} in expanded polygon")
            else:
                # No expansion occurred
                filtered_result.is_expanded = False
        else:
            # No expansion needed or not enabled
            filtered_result.is_expanded = False

        return filtered_result

    def _filter_apartment_comp_with_expansion(
        self,
        original_polygon: Dict,
        unit_key: str,
        comp_data: ApartmentCompData
    ) -> Optional[FilteredApartmentData]:
        """
        Filter apartment comp data with independent expansion logic.

        Each unit type is filtered and potentially expanded independently.
        Supports tier 3 expansion through primary roads if data is still
        insufficient after tier 1-2.
        """
        # First pass: filter against original polygon
        filtered_result = self._filter_and_analyze_apartment_comp(original_polygon, unit_key, comp_data)

        if filtered_result is None:
            return None

        # Check if expansion is needed for THIS unit type
        if (self.config.enable_polygon_expansion and
            filtered_result.filtered_count < self.config.min_data_for_analysis and
            self._boundary_expansion_data is not None and
            self._target_coords is not None):

            logger.info(f"Apartment comps {unit_key}: {filtered_result.filtered_count} in polygon "
                       f"(minimum: {self.config.min_data_for_analysis}), attempting tier 1-2 expansion")

            # Phase 1: Tier 1-2 expansion (soft boundaries only)
            expanded_polygon, expansion_metadata = self._try_expand_polygon_independent(
                enable_tier_three=False
            )

            if expanded_polygon and expansion_metadata:
                # Re-filter with tier 1-2 expanded polygon
                filtered_result = self._filter_and_analyze_apartment_comp(expanded_polygon, unit_key, comp_data)
                if filtered_result:
                    filtered_result.is_expanded = True

                    # Phase 2: Check if tier 3 is needed
                    if filtered_result.filtered_count <= self.config.min_data_for_tier_three:
                        logger.info(f"Apartment comps {unit_key} after tier 1-2: {filtered_result.filtered_count} "
                                   f"(<= {self.config.min_data_for_tier_three}), attempting tier 3 expansion")

                        # Try tier 3 expansion (crosses primary roads)
                        tier3_polygon, tier3_metadata = self._try_expand_polygon_independent(
                            enable_tier_three=True,
                            current_data_count=filtered_result.filtered_count
                        )

                        if tier3_polygon and tier3_metadata and tier3_metadata.get('tier_three_triggered'):
                            # Re-filter with tier 3 expanded polygon
                            tier3_result = self._filter_and_analyze_apartment_comp(tier3_polygon, unit_key, comp_data)
                            if tier3_result:
                                filtered_result = tier3_result
                                filtered_result.is_expanded = True
                                expansion_metadata = tier3_metadata
                                logger.info(f"Apartment comps {unit_key} after tier 3: {filtered_result.filtered_count}")

                    filtered_result.expansion_metadata = PolygonExpansionMetadata(
                        original_area_sq_degrees=expansion_metadata.get('original_area_sq_degrees', 0),
                        expanded_area_sq_degrees=expansion_metadata.get('expanded_area_sq_degrees', 0),
                        expansion_tiers_used=expansion_metadata.get('expansion_tiers_used', 0),
                        included_polygon_count=expansion_metadata.get('included_polygon_count', 1),
                        included_polygon_indices=expansion_metadata.get('included_polygon_indices', []),
                        expansion_reason=f'insufficient_apartment_comps_{unit_key}',
                        tier_three_triggered=expansion_metadata.get('tier_three_triggered', False)
                    )
                    logger.info(f"Apartment comps {unit_key} after expansion: {filtered_result.filtered_count}")
            else:
                # No expansion occurred
                filtered_result.is_expanded = False
        else:
            # No expansion needed or not enabled
            filtered_result.is_expanded = False

        return filtered_result

    def _try_expand_polygon_independent(
        self,
        enable_tier_three: bool = False,
        current_data_count: int = 0
    ) -> Tuple[Optional[Dict], Optional[Dict]]:
        """
        Attempt to expand the polygon through soft boundaries.

        This version does NOT modify the global state - it just returns the
        expansion result for independent use by each data type.

        Args:
            enable_tier_three: If True, allow tier 3 expansion through primary roads
            current_data_count: Current filtered data count (used for tier 3 decision)

        Returns:
            Tuple of (expanded_polygon_geojson, expansion_metadata_dict) or (None, None)
        """
        if not self._boundary_expansion_data or not self._target_coords:
            return None, None

        try:
            expanded_result = expand_boundary_polygon(
                self._boundary_expansion_data,
                self._target_coords,
                max_tiers=self.config.max_expansion_tiers,
                enable_tier_three=enable_tier_three,
                current_data_count=current_data_count,
                min_data_for_tier_three=self.config.min_data_for_tier_three
            )

            if not expanded_result.success or not expanded_result.data:
                logger.warning(f"Polygon expansion failed: {expanded_result.error}")
                return None, None

            expansion_metadata = expanded_result.data.get('expansion_metadata', {})
            is_expanded = expanded_result.data.get('is_expanded', False)

            if not is_expanded:
                logger.info("No expansion occurred (no soft-boundary neighbors)")
                return None, None

            expanded_polygon = expanded_result.data.get('polygon')
            if expanded_polygon:
                original_area = self.state.data.boundary_polygon.polygon_area_sq_degrees or 0
                expanded_area = expansion_metadata.get('expanded_area_sq_degrees', 0)

                # Return the expansion data without modifying global state
                full_metadata = {
                    'original_area_sq_degrees': original_area,
                    'expanded_area_sq_degrees': expanded_area,
                    'expansion_tiers_used': expansion_metadata.get('expansion_tiers_used', 0),
                    'included_polygon_count': expansion_metadata.get('included_polygon_count', 1),
                    'included_polygon_indices': expansion_metadata.get('included_polygon_indices', []),
                    'tier_three_triggered': expansion_metadata.get('tier_three_triggered', False)
                }

                tier_info = " (tier 3 triggered)" if full_metadata['tier_three_triggered'] else ""
                logger.info(f"Polygon expansion available: {full_metadata['included_polygon_count']} polygons, "
                           f"area {original_area:.6f} -> {expanded_area:.6f} sq degrees{tier_info}")
                return expanded_polygon, full_metadata

            return None, None

        except Exception as e:
            logger.error(f"Error during polygon expansion: {e}", exc_info=True)
            return None, None

    def _build_input_property_info(self) -> InputPropertyInfo:
        """Build consolidated input property info from all workflow data."""
        data = self.state.data

        # Start with address info
        input_property = InputPropertyInfo(
            street=data.address.street,
            city=data.address.city,
            state=data.address.state,
            zip=data.address.zip
        )

        # Add geocoding info
        if data.geocoding:
            input_property.lat = data.geocoding.lat
            input_property.lon = data.geocoding.lon
            input_property.display_name = data.geocoding.display_name

        # Add property details
        if data.property_info:
            input_property.property_type = data.property_info.property_type
            input_property.bedrooms = data.property_info.bedrooms
            input_property.bathrooms = data.property_info.bathrooms
            input_property.square_footage = data.property_info.square_footage
            input_property.year_built = data.property_info.year_built
            input_property.lot_size = data.property_info.lot_size
            input_property.total_units = data.property_info.total_units
            input_property.units = data.property_info.units

        # Add property tax info
        if data.property_tax:
            input_property.annual_taxes = data.property_tax.annual_taxes
            input_property.tax_year = data.property_tax.tax_year

        # Add adjusted interest rate
        if data.interest_rate and data.property_info:
            adj_result = adjust_interest_rate({
                'interest_rate': data.interest_rate.interest_rate,
                'property_type': data.property_info.property_type or '',
                'is_primary_residence': self.config.is_primary_residence
            })
            if adj_result.success and adj_result.data:
                input_property.interest_rate = adj_result.data.get('adjusted_rate')
            else:
                # Fallback to base rate if adjustment fails
                input_property.interest_rate = data.interest_rate.interest_rate
        elif data.interest_rate:
            # No property info available, use base rate
            input_property.interest_rate = data.interest_rate.interest_rate

        return input_property

    def _filter_and_analyze_sales(self, polygon: Dict) -> FilteredSalesData:
        """Filter sales data by polygon, calculate price per sqft, and compute summary."""
        sales_data = self.state.data.sales_data

        # Prepare addresses for filtering (only those with lat/lon)
        addresses_to_check = []
        for i, sale in enumerate(sales_data.sales):
            if sale.lat is not None and sale.lon is not None:
                addresses_to_check.append({
                    'index': i,
                    'lat': sale.lat,
                    'lon': sale.lon
                })

        # Filter by polygon
        filtered_entries = []
        if addresses_to_check:
            check_result = check_addresses_against_polygon({
                'polygon': polygon,
                'addresses': addresses_to_check
            })

            # Get filtered entries (inside + boundary)
            if check_result.success:
                inside_addresses = check_result.data.get('inside', [])
                boundary_addresses = check_result.data.get('boundary', [])
                inside_indices = {addr['index'] for addr in inside_addresses}
                boundary_indices = {addr['index'] for addr in boundary_addresses}

                for i, sale in enumerate(sales_data.sales):
                    if i in inside_indices or i in boundary_indices:
                        # Create a copy with price_per_sqft calculated
                        entry_with_ppsf = self._calculate_price_per_sqft(sale)
                        filtered_entries.append(entry_with_ppsf)

        # Calculate five-number summary for price per square foot
        price_per_sqft_values = []
        for entry in filtered_entries:
            if entry.price_per_sqft is not None:
                price_per_sqft_values.append(entry.price_per_sqft)

        price_summary = None
        if price_per_sqft_values:
            summary_result = get_five_number_summary({
                'values': price_per_sqft_values,
                'field_name': 'price_per_sqft'
            })
            if summary_result.success or summary_result.data:
                price_summary = FiveNumberSummaryResult(**summary_result.data)
                if summary_result.error_code:
                    price_summary.error_code = summary_result.error_code.value

        return FilteredSalesData(
            filtered_addresses=filtered_entries,
            filtered_count=len(filtered_entries),
            original_count=len(sales_data.sales),
            price_summary=price_summary
        )

    def _calculate_price_per_sqft(self, sale: SalesDataEntry) -> SalesDataEntry:
        """Calculate price per square foot for a sales entry and return updated entry."""
        # Create a copy of the sale entry
        entry_dict = sale.model_dump()

        # Calculate price per sqft if both price and sqft are available
        price_per_sqft = None
        if sale.sale_price is not None and sale.sqft is not None:
            try:
                # Parse price (handle string with $ and commas)
                price_str = str(sale.sale_price).replace(',', '').replace('$', '')
                price = float(price_str)

                # Parse sqft (handle string)
                sqft_str = str(sale.sqft).replace(',', '')
                sqft = float(sqft_str)

                if sqft > 0:
                    price_per_sqft = round(price / sqft, 2)
            except (ValueError, TypeError):
                pass

        entry_dict['price_per_sqft'] = price_per_sqft
        return SalesDataEntry(**entry_dict)

    def _calculate_rent_per_sqft(self, listing: ApartmentCompEntry) -> ApartmentCompEntry:
        """Calculate rent per square foot for an apartment comp entry and return updated entry."""
        # Create a copy of the listing entry
        entry_dict = listing.model_dump()

        # Calculate rent per sqft if both rent and sqft are available
        rent_per_sqft = None
        if listing.rent is not None and listing.sqft is not None:
            try:
                rent = float(listing.rent)
                sqft = float(listing.sqft)

                if sqft > 0:
                    rent_per_sqft = round(rent / sqft, 2)
            except (ValueError, TypeError):
                pass

        entry_dict['rent_per_sqft'] = rent_per_sqft
        return ApartmentCompEntry(**entry_dict)

    def _filter_and_analyze_apartment_comp(
        self,
        polygon: Dict,
        unit_key: str,
        comp_data: ApartmentCompData
    ) -> Optional[FilteredApartmentData]:
        """Filter apartment comps by polygon, calculate rent per sqft, and compute summary."""

        # Prepare addresses for filtering
        addresses_to_check = []
        for i, listing in enumerate(comp_data.listings):
            if listing.lat is not None and listing.lon is not None:
                addresses_to_check.append({
                    'index': i,
                    'lat': listing.lat,
                    'lon': listing.lon
                })

        # Filter by polygon
        filtered_entries = []
        if addresses_to_check:
            check_result = check_addresses_against_polygon({
                'polygon': polygon,
                'addresses': addresses_to_check
            })

            # Get filtered entries (inside + boundary)
            if check_result.success:
                inside_addresses = check_result.data.get('inside', [])
                boundary_addresses = check_result.data.get('boundary', [])
                inside_indices = {addr['index'] for addr in inside_addresses}
                boundary_indices = {addr['index'] for addr in boundary_addresses}

                for i, listing in enumerate(comp_data.listings):
                    if i in inside_indices or i in boundary_indices:
                        # Create a copy with rent_per_sqft calculated
                        entry_with_rpsf = self._calculate_rent_per_sqft(listing)
                        # Only include entries that have valid square footage for rent per sqft analysis
                        if entry_with_rpsf.rent_per_sqft is not None:
                            filtered_entries.append(entry_with_rpsf)

        # Calculate five-number summary for rent per square foot
        rent_per_sqft_values = []
        for entry in filtered_entries:
            if entry.rent_per_sqft is not None:
                rent_per_sqft_values.append(entry.rent_per_sqft)

        rent_summary = None
        if rent_per_sqft_values:
            summary_result = get_five_number_summary({
                'values': rent_per_sqft_values,
                'field_name': 'rent_per_sqft'
            })
            if summary_result.success or summary_result.data:
                rent_summary = FiveNumberSummaryResult(**summary_result.data)
                if summary_result.error_code:
                    rent_summary.error_code = summary_result.error_code.value

        return FilteredApartmentData(
            unit_key=unit_key,
            filtered_addresses=filtered_entries,
            filtered_count=len(filtered_entries),
            original_count=len(comp_data.listings),
            rent_summary=rent_summary
        )

    # =========================================================================
    # Output Building
    # =========================================================================

    def _build_output(self, workflow_start_time: str) -> Dict[str, Any]:
        """Build the final workflow output."""
        workflow_end_time = datetime.utcnow().isoformat() + "Z"
        total_execution_time = time.time() - self.state.start_time

        completed, failed, skipped = [], [], []
        for step_name, step_result in self.state.steps.items():
            if step_result.status == WorkflowStepStatus.COMPLETED:
                completed.append(step_name)
            elif step_result.status == WorkflowStepStatus.FAILED:
                failed.append(step_name)
            elif step_result.status == WorkflowStepStatus.SKIPPED:
                skipped.append(step_name)

        for unit_key, step_result in self.state.apartment_comps.items():
            step_name = f"apartment_comps_{unit_key}"
            if step_result.status == WorkflowStepStatus.COMPLETED:
                completed.append(step_name)
            elif step_result.status == WorkflowStepStatus.FAILED:
                failed.append(step_name)

        # Build step_details without the 'data' field to avoid duplication
        # (data is already in the top-level 'data' object)
        all_steps = list(self.state.steps.values()) + list(self.state.apartment_comps.values())
        step_details = [
            step.model_dump(exclude={'data'}, exclude_none=True)
            for step in all_steps
        ]

        output = NewRentalWorkflowOutput(
            success=len(completed) > 0 and self.state.steps[WorkflowStep.VALIDATION.value].success,
            completed_steps=completed,
            failed_steps=failed,
            skipped_steps=skipped if skipped else None,
            data=self.state.data,
            metadata=WorkflowOutputMetadata(
                total_api_calls=self.state.metadata['total_api_calls'],
                total_execution_time=total_execution_time,
                workflow_start_time=workflow_start_time,
                workflow_end_time=workflow_end_time,
                step_details=step_details
            ),
            errors=self.state.errors if self.state.errors else None
        )

        log_workflow_complete(
            'new_rental_workflow',
            output.success,
            completed,
            failed,
            self.state.metadata['total_api_calls'],
            int(total_execution_time * 1000),
            logger
        )

        return output.model_dump(exclude_none=True)

    def _build_error_response(self, error: str, workflow_start_time: str, start_time: float) -> Dict[str, Any]:
        """Build an error response for invalid input."""
        return {
            'success': False,
            'completed_steps': [],
            'failed_steps': ['input_validation'],
            'data': {},
            'metadata': {
                'total_api_calls': 0,
                'total_execution_time': time.time() - start_time,
                'workflow_start_time': workflow_start_time,
                'workflow_end_time': datetime.utcnow().isoformat() + "Z",
                'step_details': []
            },
            'errors': [{'step': 'input_validation', 'error': error, 'code': ErrorCode.VALIDATION_ERROR.value}]
        }
