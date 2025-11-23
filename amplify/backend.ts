import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { countyName } from './functions/countyName/resource';
import { neighborhoodName } from './functions/neighborhoodName/resource';
import { initialPropertyInfo } from './functions/initialPropertyInfo/resource';
import { propertyTaxRealtor } from './functions/propertyTaxRealtor/resource';
import { recentSaleInfo } from './functions/recentSaleInfo/resource';
import { interestRateFinal } from './functions/interestRateFinal/resource';
import { compSalesCollectNeighbor } from './functions/compSalesCollectNeighbor/resource';
import { compSalesCollectCity } from './functions/compSalesCollectCity/resource';
import { socioNeighborhoodCompare } from './functions/socioNeighborhoodCompare/resource';
import { cityCompare } from './functions/cityCompare/resource';
import { zillowZipSearch } from './functions/zillowZipSearch/resource';
import { apartmentComp } from './functions/apartmentComp/resource';
import { rentalWorkflow } from './functions/rentalWorkflow/resource_python';
// import { testGeocoding } from './functions/testGeocoding/resource_python';

/**
 * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
 */
const backend = defineBackend({
  auth,
  data,
  countyName,
  neighborhoodName,
  initialPropertyInfo,
  propertyTaxRealtor,
  recentSaleInfo,
  interestRateFinal,
  compSalesCollectNeighbor,
  compSalesCollectCity,
  socioNeighborhoodCompare,
  cityCompare,
  zillowZipSearch,
  apartmentComp,
  rentalWorkflow
  // testGeocoding
});

