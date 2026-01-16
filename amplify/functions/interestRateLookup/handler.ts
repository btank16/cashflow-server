/**
 * Interest Rate Lookup Handler
 *
 * Looks up current mortgage interest rates using Perplexity AI
 * and applies adjustments based on residence type and down payment.
 *
 * Adjustments:
 * - Investment property (isPersonal=false): +1.0%
 * - Down payment 15%: +0.13%
 * - Down payment 10%: +0.25%
 * - Down payment 5%: +0.5%
 */

interface InterestRateLookupArgs {
  loanType: string;      // e.g., "30-year fixed"
  isPersonal: boolean;   // true = primary residence, false = investment
  downPayment: number;   // e.g., 20.0
  state: string;         // e.g., "Ohio"
}

interface InterestRateLookupResponse {
  baseRate: number;
  adjRate: number;
}

interface LambdaEvent {
  arguments: InterestRateLookupArgs;
}

interface PerplexityResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface PerplexityParsedOutput {
  interest_rate: number;
}

const SYSTEM_PROMPT =
  'Only give me the value requested in the JSON format. If you are not able to get search results or find relevant information, please state that clearly rather than providing speculative information. Do this by leaving the json field empty if you cannot find relevant information.';

const SEARCH_DOMAINS = ['freddiemac.com', 'nerdwallet.com', 'bankrate.com'];

export const handler = async (event: LambdaEvent): Promise<InterestRateLookupResponse> => {
  console.log('interestRateLookup invoked');

  const { loanType, isPersonal, downPayment, state } = event.arguments;

  // Validate inputs
  if (!loanType || !state || downPayment === undefined || isPersonal === undefined) {
    throw new Error('Missing required fields: loanType, isPersonal, downPayment, state');
  }

  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.error('PERPLEXITY_API_KEY not configured');
    throw new Error('Server configuration error');
  }

  // Validate down payment value
  const validDownPayments = [5, 10, 15, 20];
  if (!validDownPayments.includes(downPayment)) {
    throw new Error(`Invalid downPayment: ${downPayment}. Must be one of: ${validDownPayments.join(', ')}`);
  }

  // Build the user prompt (always use 20% for the API lookup)
  const userPrompt = `I need you to find me mortgage rates for a ${loanType} mortgage in ${state}. Note that I am putting 20% down as a down payment`;

  console.log('Calling Perplexity API for interest rate lookup');

  // Call Perplexity API
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      web_search_options: {
        search_domain_filter: SEARCH_DOMAINS,
      },
      response_format: {
        type: 'json_schema',
        json_schema: {
          schema: {
            type: 'object',
            properties: {
              interest_rate: { type: 'number' },
            },
            required: ['interest_rate'],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Perplexity API error:', response.status, errorText);
    throw new Error(`Perplexity API error: ${response.status}`);
  }

  const data = (await response.json()) as PerplexityResponse;

  if (!data.choices || !data.choices[0]?.message?.content) {
    console.error('Invalid Perplexity response:', data);
    throw new Error('Invalid response from Perplexity API');
  }

  // Parse the JSON response
  let parsed: PerplexityParsedOutput;
  try {
    parsed = JSON.parse(data.choices[0].message.content);
  } catch (e) {
    console.error('Failed to parse Perplexity response:', data.choices[0].message.content);
    throw new Error('Failed to parse interest rate response');
  }

  const baseRate = parsed.interest_rate;

  if (typeof baseRate !== 'number' || isNaN(baseRate)) {
    console.error('Invalid interest rate value:', baseRate);
    throw new Error('Invalid interest rate returned from API');
  }

  // Calculate down payment adjustment
  let downPaymentAdjustment = 0;
  if (downPayment === 15) {
    downPaymentAdjustment = 0.13;
  } else if (downPayment === 10) {
    downPaymentAdjustment = 0.25;
  } else if (downPayment === 5) {
    downPaymentAdjustment = 0.5;
  }
  // downPayment === 20 has no adjustment

  // Calculate investment property adjustment
  const personalAdjustment = isPersonal ? 0 : 1.0;

  // Total adjustment (stacked)
  const totalAdjustment = downPaymentAdjustment + personalAdjustment;
  const adjRate = parseFloat((baseRate + totalAdjustment).toFixed(2));

  console.log(`Interest rate lookup complete: baseRate=${baseRate}, adjRate=${adjRate}, isPersonal=${isPersonal}, downPayment=${downPayment}, totalAdjustment=${totalAdjustment}`);

  return {
    baseRate,
    adjRate,
  };
};
