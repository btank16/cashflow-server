/**
 * Offer Letter Handler
 *
 * Uses Google Gemini 3 Flash Preview to generate offer letters for real estate investments.
 * Supports different offer types (rental, flip, brrrr) and customizable sender/receiver combinations.
 */

import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

// =============================================================================
// Type Definitions
// =============================================================================

type OfferType = 'rental' | 'flip' | 'brrrr';
type ReceiverType = 'homeowner' | 'lender' | 'realtor' | 'investor';

// =============================================================================
// Receiver Configuration
// =============================================================================

interface ReceiverDataConfig {
  includeRehabCost: boolean;
  includeUnitRents: boolean;
  includeRentComps: boolean;
  includeLoanInfo: boolean;
  includeMortgageCost: boolean;
  includeDSCR: boolean;
  includeAnnualCashflow: boolean;
  includeCashOnCash: boolean;
  includeCapRate: boolean;
}

// Data inclusion config for rental offerType by receiver
const RENTAL_RECEIVER_CONFIG: Record<ReceiverType, ReceiverDataConfig> = {
  homeowner: {
    includeRehabCost: true,
    includeUnitRents: false,
    includeRentComps: false,
    includeLoanInfo: false,
    includeMortgageCost: false,
    includeDSCR: false,
    includeAnnualCashflow: false,
    includeCashOnCash: false,
    includeCapRate: false,
  },
  lender: {
    includeRehabCost: false,
    includeUnitRents: true,
    includeRentComps: true,
    includeLoanInfo: true,
    includeMortgageCost: true,
    includeDSCR: true,
    includeAnnualCashflow: false,
    includeCashOnCash: false,
    includeCapRate: false,
  },
  realtor: {
    includeRehabCost: true,
    includeUnitRents: true,
    includeRentComps: true,
    includeLoanInfo: true,
    includeMortgageCost: false,
    includeDSCR: false,
    includeAnnualCashflow: true,
    includeCashOnCash: false,
    includeCapRate: false,
  },
  investor: {
    includeRehabCost: true,
    includeUnitRents: true,
    includeRentComps: true,
    includeLoanInfo: true,
    includeMortgageCost: false,
    includeDSCR: false,
    includeAnnualCashflow: true,
    includeCashOnCash: true,
    includeCapRate: true,
  },
};

interface TargetProperty {
  fullAddress: string;
  purchasePrice: number;
  pricePerSqft: number;
}

interface LoanInfo {
  loanTerm: number;
  downPaymentPercent: number;
  interestRate: number;
}

interface RehabCostItem {
  category: string;
  cost: number;
}

interface RehabCost {
  items: RehabCostItem[];
  total: number;
}

interface PurchaseComp {
  address: string;
  purchasePrice: number;
  pricePerSqft: number;
}

interface RentComp {
  address: string;
  rent: number;
}

interface SelectedUnitRent {
  unitLabel: string;
  rent: number;
}

interface InvestmentMetrics {
  DSCR: number | string;
  annualCashflow: number;
  mortgageCost: number;
  cashOnCash: number;
  capRate: number;
}

interface RentalInputData {
  targetProperty: TargetProperty;
  loanInfo: LoanInfo;
  rehabCost: RehabCost;
  purchaseComps: PurchaseComp[];
  rentComps: Record<string, RentComp[]>;
  selectedUnitRents: SelectedUnitRent[];
  totalMonthlyRent: number;
  metrics: InvestmentMetrics;
}

interface SenderInfo {
  firstName?: string;
  lastName?: string;
}

interface OfferLetterArgs {
  offerType: OfferType;
  receiver: string;
  inputData: RentalInputData;
  senderFirstName?: string;
  senderLastName?: string;
}

interface OfferLetterResponse {
  success: boolean;
  letter?: string;
  error?: string;
}

interface LambdaEvent {
  arguments: OfferLetterArgs;
}

// =============================================================================
// Output Schema
// =============================================================================

const OUTPUT_SCHEMA = {
  type: Type.OBJECT,
  required: ['letter'],
  properties: {
    letter: {
      type: Type.STRING,
      description: 'The complete offer letter as plain text, formatted for email sharing'
    }
  }
};

// =============================================================================
// Helper Functions
// =============================================================================

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

const formatPercent = (value: number): string => {
  return `${value.toFixed(2)}%`;
};

// Check if a value has meaningful data (not empty/zero/null)
const hasData = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
};

// Check if rehab cost has meaningful data
const hasRehabCost = (rehabCost: RehabCost): boolean => {
  return rehabCost.total > 0 && rehabCost.items.length > 0;
};

// Check if purchase comps have data
const hasPurchaseComps = (comps: PurchaseComp[]): boolean => {
  return comps.length > 0;
};

// Check if rent comps have data
const hasRentComps = (rentComps: Record<string, RentComp[]>): boolean => {
  return Object.values(rentComps).some(comps => comps.length > 0);
};

// Check if unit rents have data
const hasUnitRents = (unitRents: SelectedUnitRent[]): boolean => {
  return unitRents.length > 0 && unitRents.some(u => u.rent > 0);
};

// Get receiver config for offer type
const getReceiverConfig = (offerType: OfferType, receiver: ReceiverType): ReceiverDataConfig => {
  switch (offerType) {
    case 'rental':
      return RENTAL_RECEIVER_CONFIG[receiver] || RENTAL_RECEIVER_CONFIG.homeowner;
    case 'flip':
    case 'brrrr':
      // Use rental config for now as placeholder
      return RENTAL_RECEIVER_CONFIG[receiver] || RENTAL_RECEIVER_CONFIG.homeowner;
    default:
      return RENTAL_RECEIVER_CONFIG.homeowner;
  }
};

// =============================================================================
// Prompt Builders
// =============================================================================

const buildSystemPrompt = (offerType: OfferType, receiver: ReceiverType, senderInfo?: SenderInfo): string => {
  // Offer type descriptions for context
  const offerTypeDescriptions: Record<OfferType, string> = {
    rental: 'This is a rental investment property analysis',
    flip: 'This is a fix-and-flip investment property analysis',
    brrrr: 'This is a BRRRR (Buy, Rehab, Rent, Refinance, Repeat) investment property analysis',
  };

  // Receiver-specific voice and content guidance
  const receiverGuidance: Record<ReceiverType, { voice: string; focus: string }> = {
    homeowner: {
      voice: 'Empathetic and respectful of the homeowner\'s attachment to their property. Warm but professional.',
      focus: 'Focus on the fair market value based on comparable sales. If rehab is needed, explain how condition affects pricing. Emphasize a smooth, hassle-free transaction.',
    },
    lender: {
      voice: 'Formal and data-driven. Focus on financial viability and risk assessment.',
      focus: 'Emphasize the loan-to-value ratio, debt service coverage ratio (DSCR), and income stability. Highlight rental income projections and comparable rental data to demonstrate the property can service the debt.',
    },
    realtor: {
      voice: 'Professional and market-savvy. Acknowledge their expertise and role in the transaction.',
      focus: 'Present market-based analysis with comparable sales and rental data. Mention investment potential and annual cashflow to show this is a serious, well-researched offer.',
    },
    investor: {
      voice: 'Direct, analytical, and ROI-focused. Speak investor-to-investor.',
      focus: 'Lead with investment metrics: cash-on-cash return, cap rate, and annual cashflow. Include detailed comparable data. Be transparent about the deal structure and expected returns.',
    },
  };

  const guidance = receiverGuidance[receiver];

  // Build sender description
  let senderDescription = 'Real estate investor';
  if (senderInfo?.firstName || senderInfo?.lastName) {
    const fullName = [senderInfo.firstName, senderInfo.lastName].filter(Boolean).join(' ');
    senderDescription = `${fullName}, a real estate investor`;
  }

  // Build signature instruction if sender name is provided
  const signatureInstruction = senderInfo?.firstName
    ? `\n- Sign the letter with the sender's name: ${[senderInfo.firstName, senderInfo.lastName].filter(Boolean).join(' ')}`
    : '';

  return `You are a professional real estate investor drafting an offer letter to purchase a rental property.

CONTEXT:
- Sender: ${senderDescription}
- Receiver: ${receiver}
- ${offerTypeDescriptions[offerType]}

VOICE & TONE:
${guidance.voice}

CONTENT FOCUS:
${guidance.focus}

FORMAT REQUIREMENTS:
- Output as plain text suitable for sharing via email or text message
- Use clear paragraph breaks for readability
- Include a professional greeting and closing
- Do NOT use markdown formatting (no **, ##, etc.)
- Keep the letter concise but comprehensive (aim for 250-400 words)
- Only include information that is provided in the data - do not make up or assume any values${signatureInstruction}

CONTENT GUIDELINES:
- Start with a brief introduction expressing interest in the property
- Reference the offer price and key supporting data points
- Only mention data fields that are actually provided (skip sections with no data)
- Close with next steps and contact invitation`;
};

const buildRentalUserPrompt = (inputData: RentalInputData, config: ReceiverDataConfig): string => {
  const { targetProperty, loanInfo, rehabCost, purchaseComps, rentComps, selectedUnitRents, totalMonthlyRent, metrics } = inputData;

  const sections: string[] = [];

  // Always include property details (all receivers)
  sections.push(`PROPERTY DETAILS:
Address: ${targetProperty.fullAddress}
Offer Price: ${formatCurrency(targetProperty.purchasePrice)}
Price Per Sqft: ${formatCurrency(targetProperty.pricePerSqft)}/sqft`);

  // Comparable sales - all receivers, but only if data exists
  if (hasPurchaseComps(purchaseComps)) {
    const purchaseCompsText = purchaseComps.map((comp, i) =>
      `  ${i + 1}. ${comp.address}: ${formatCurrency(comp.purchasePrice)} (${formatCurrency(comp.pricePerSqft)}/sqft)`
    ).join('\n');
    sections.push(`COMPARABLE SALES:
${purchaseCompsText}`);
  }

  // Financing terms - conditional on config and data
  if (config.includeLoanInfo && hasData(loanInfo.interestRate)) {
    sections.push(`FINANCING TERMS:
Loan Term: ${loanInfo.loanTerm} years
Down Payment: ${loanInfo.downPaymentPercent}%
Interest Rate: ${formatPercent(loanInfo.interestRate)}`);
  }

  // Rehab costs - conditional on config and data
  if (config.includeRehabCost && hasRehabCost(rehabCost)) {
    const rehabItems = rehabCost.items.map(item => `${item.category} (${formatCurrency(item.cost)})`).join(', ');
    sections.push(`REHAB CONSIDERATIONS:
Anticipated Rehab Investment: ${formatCurrency(rehabCost.total)}
Items: ${rehabItems}`);
  }

  // Rent comps - conditional on config and data
  if (config.includeRentComps && hasRentComps(rentComps)) {
    const rentCompsText = Object.entries(rentComps).map(([unitType, comps]) => {
      const unitLabel = unitType.replace('bd_', 'bd/').replace('ba', 'ba');
      const compsList = comps.map((comp, i) =>
        `    ${i + 1}. ${comp.address}: ${formatCurrency(comp.rent)}/mo`
      ).join('\n');
      return `  ${unitLabel}:\n${compsList}`;
    }).join('\n');
    sections.push(`COMPARABLE RENTALS:
${rentCompsText}`);
  }

  // Projected rental income - conditional on config and data
  if (config.includeUnitRents && hasUnitRents(selectedUnitRents)) {
    const projectedRentText = selectedUnitRents.map(unit =>
      `  ${unit.unitLabel}: ${formatCurrency(unit.rent)}/mo`
    ).join('\n');
    sections.push(`PROJECTED RENTAL INCOME:
${projectedRentText}
Total Monthly Rent: ${formatCurrency(totalMonthlyRent)}`);
  }

  // Investment metrics - build dynamically based on config and data
  const metricLines: string[] = [];

  if (config.includeMortgageCost && hasData(metrics.mortgageCost)) {
    metricLines.push(`Monthly Mortgage Payment: ${formatCurrency(metrics.mortgageCost)}`);
  }
  if (config.includeDSCR && hasData(metrics.DSCR)) {
    const dscrValue = typeof metrics.DSCR === 'number' ? metrics.DSCR.toFixed(2) : metrics.DSCR;
    metricLines.push(`DSCR: ${dscrValue}`);
  }
  if (config.includeAnnualCashflow && hasData(metrics.annualCashflow)) {
    metricLines.push(`Annual Cash Flow: ${formatCurrency(metrics.annualCashflow)}`);
  }
  if (config.includeCashOnCash && hasData(metrics.cashOnCash)) {
    metricLines.push(`Cash-on-Cash Return: ${formatPercent(metrics.cashOnCash)}`);
  }
  if (config.includeCapRate && hasData(metrics.capRate)) {
    metricLines.push(`Cap Rate: ${formatPercent(metrics.capRate)}`);
  }

  if (metricLines.length > 0) {
    sections.push(`INVESTMENT METRICS:
${metricLines.join('\n')}`);
  }

  return `Generate an offer letter for this rental property investment using ONLY the data provided below. Do not include any information that is not listed.

${sections.join('\n\n')}

Please write a compelling offer letter that incorporates the above data professionally.`;
};

// =============================================================================
// Main Handler
// =============================================================================

export const handler = async (event: LambdaEvent): Promise<OfferLetterResponse> => {
  console.log('offerLetter invoked');

  const { offerType, receiver, inputData, senderFirstName, senderLastName } = event.arguments;

  // Validate required fields
  if (!offerType || !receiver || !inputData) {
    return {
      success: false,
      error: 'Missing required fields: offerType, receiver, and inputData are required'
    };
  }

  // Validate offer type
  if (!['rental', 'flip', 'brrrr'].includes(offerType)) {
    return {
      success: false,
      error: `Invalid offerType: ${offerType}. Must be one of: rental, flip, brrrr`
    };
  }

  // Validate receiver type
  const validReceivers: ReceiverType[] = ['homeowner', 'lender', 'realtor', 'investor'];
  if (!validReceivers.includes(receiver as ReceiverType)) {
    return {
      success: false,
      error: `Invalid receiver: ${receiver}. Must be one of: ${validReceivers.join(', ')}`
    };
  }

  const receiverType = receiver as ReceiverType;

  // Build sender info object
  const senderInfo: SenderInfo = {
    firstName: senderFirstName,
    lastName: senderLastName,
  };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not configured');
    return {
      success: false,
      error: 'Server configuration error'
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // Get receiver-specific data configuration
    const receiverConfig = getReceiverConfig(offerType as OfferType, receiverType);

    // Build prompts based on offer type and receiver
    let systemPrompt: string;
    let userPrompt: string;

    switch (offerType) {
      case 'rental':
        systemPrompt = buildSystemPrompt(offerType as OfferType, receiverType, senderInfo);
        userPrompt = buildRentalUserPrompt(inputData as RentalInputData, receiverConfig);
        break;
      case 'flip':
      case 'brrrr':
        // Placeholder for future offer types - use rental prompts for now
        systemPrompt = buildSystemPrompt(offerType as OfferType, receiverType, senderInfo);
        userPrompt = buildRentalUserPrompt(inputData as RentalInputData, receiverConfig);
        break;
      default:
        return {
          success: false,
          error: `Unsupported offer type: ${offerType}`
        };
    }

    console.log('Generating offer letter with Gemini...');

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW
        },
        responseMimeType: 'application/json',
        responseSchema: OUTPUT_SCHEMA
      }
    });

    if (!response.text) {
      return {
        success: false,
        error: 'Empty response from Gemini API'
      };
    }

    const parsed = JSON.parse(response.text);

    console.log('Offer letter generated successfully');

    return {
      success: true,
      letter: parsed.letter
    };
  } catch (error) {
    console.error('Gemini API error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};
