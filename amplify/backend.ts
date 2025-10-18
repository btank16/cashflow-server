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
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';

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
  cityCompare
});

// Access all stacks that contain Lambda functions
const authStack = backend.auth.stack;
const dataStack = backend.data.stack;
const countyNameStack = backend.countyName.stack;
const neighborhoodNameStack = backend.neighborhoodName.stack;
const initialPropertyInfoStack = backend.initialPropertyInfo.stack;
const propertyTaxRealtorStack = backend.propertyTaxRealtor.stack;
const recentSaleInfoStack = backend.recentSaleInfo.stack;
const interestRateFinalStack = backend.interestRateFinal.stack;
const compSalesCollectNeighborStack = backend.compSalesCollectNeighbor.stack;
const compSalesCollectCityStack = backend.compSalesCollectCity.stack;
const socioNeighborhoodCompareStack = backend.socioNeighborhoodCompare.stack;
const cityCompareStack = backend.cityCompare.stack;

// Update all functions to use Node.js 22.x
const allStacks = [
  authStack,
  dataStack,
  countyNameStack,
  neighborhoodNameStack,
  initialPropertyInfoStack,
  propertyTaxRealtorStack,
  recentSaleInfoStack,
  interestRateFinalStack,
  compSalesCollectNeighborStack,
  compSalesCollectCityStack,
  socioNeighborhoodCompareStack,
  cityCompareStack
];

allStacks.forEach(stack => {
  stack.node.children.forEach((child) => {
    if (child instanceof NodejsFunction) {
      const cfnFunction = child.node.defaultChild as any;
      if (cfnFunction) {
        cfnFunction.addPropertyOverride('Runtime', Runtime.NODEJS_22_X.name);
      }
    }
  });
});
