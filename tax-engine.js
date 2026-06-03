(function (root) {
  const STATUS_LABELS = new Set(["Single", "MFJ", "HoH", "MFS"]);

  function toNonNegativeNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  function normalizeFilingStatus(status) {
    return STATUS_LABELS.has(status) ? status : "MFJ";
  }

  function progressiveTax(amount, brackets) {
    const taxable = toNonNegativeNumber(amount);
    return brackets.reduce((tax, bracket, index) => {
      const next = brackets[index + 1];
      const upper = bracket.end == null ? next?.start ?? Infinity : bracket.end;
      const slice = Math.max(0, Math.min(taxable, upper) - bracket.start);
      return tax + slice * bracket.rate;
    }, 0);
  }

  function marginalRate(amount, brackets) {
    const taxable = toNonNegativeNumber(amount);
    for (let index = 0; index < brackets.length; index += 1) {
      const next = brackets[index + 1];
      if (!next || taxable <= next.start) {
        return brackets[index].rate;
      }
    }
    return brackets.at(-1).rate;
  }

  function longTermCapitalGainTax(input, parameters) {
    const filingStatus = normalizeFilingStatus(input.filingStatus);
    const bands = parameters.federal.longTermCapitalGainBands[filingStatus];
    const ordinaryIncome = toNonNegativeNumber(input.ordinaryIncome);
    const gains = toNonNegativeNumber(input.longTermCapitalGains);
    const zeroRateAmount = Math.min(gains, Math.max(0, bands.zeroTop - ordinaryIncome));
    const fifteenRateCapacity = Math.max(0, bands.fifteenTop - Math.max(ordinaryIncome, bands.zeroTop));
    const fifteenRateAmount = Math.min(Math.max(0, gains - zeroRateAmount), fifteenRateCapacity);
    const twentyRateAmount = Math.max(0, gains - zeroRateAmount - fifteenRateAmount);
    return fifteenRateAmount * 0.15 + twentyRateAmount * 0.2;
  }

  function stateTax(input, parameters) {
    const stateName = input.state || "None";
    const state = parameters.states[stateName];
    const totalTaxableIncome = toNonNegativeNumber(input.totalTaxableIncome);
    if (!state || state.structure === "none") return 0;
    if (state.quickCalcBrackets) {
      const stateTaxableIncome = Math.max(0, totalTaxableIncome - state.quickCalcStandardDeduction);
      return progressiveTax(stateTaxableIncome, state.quickCalcBrackets);
    }
    return Math.max(0, totalTaxableIncome - toNonNegativeNumber(state.standardDeduction)) * toNonNegativeNumber(state.topRate);
  }

  function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  function calculateQuickCalc(input, parameters) {
    const filingStatus = normalizeFilingStatus(input.filingStatus);
    const ordinaryIncome = toNonNegativeNumber(input.ordinaryIncome);
    const longTermCapitalGains = toNonNegativeNumber(input.longTermCapitalGains);
    const totalTaxableIncome = ordinaryIncome + longTermCapitalGains;
    const brackets = parameters.federal.ordinaryBrackets[filingStatus];
    const federalOrdinaryTax = progressiveTax(ordinaryIncome, brackets);
    const federalLongTermCapitalGainsTax = longTermCapitalGainTax(
      { filingStatus, ordinaryIncome, longTermCapitalGains },
      parameters
    );
    const federalTaxTotal = federalOrdinaryTax + federalLongTermCapitalGainsTax;
    const calculatedStateTax = stateTax({ ...input, totalTaxableIncome }, parameters);
    const combinedTax = federalTaxTotal + calculatedStateTax;
    return {
      filingStatus,
      state: input.state || "None",
      ordinaryIncome,
      longTermCapitalGains,
      totalTaxableIncome: roundMoney(totalTaxableIncome),
      federalOrdinaryTax: roundMoney(federalOrdinaryTax),
      federalLongTermCapitalGainsTax: roundMoney(federalLongTermCapitalGainsTax),
      federalTaxTotal: roundMoney(federalTaxTotal),
      federalMarginalRate: marginalRate(ordinaryIncome, brackets),
      federalEffectiveRate: totalTaxableIncome ? federalTaxTotal / totalTaxableIncome : 0,
      stateTax: roundMoney(calculatedStateTax),
      stateEffectiveRate: totalTaxableIncome ? calculatedStateTax / totalTaxableIncome : 0,
      combinedTax: roundMoney(combinedTax),
      combinedEffectiveRate: totalTaxableIncome ? combinedTax / totalTaxableIncome : 0,
      sourceCells: {
        ordinaryBrackets: "Tax Parameters!B5:F11",
        longTermCapitalGains: "Quick Calc!B12",
        stateTax: "Quick Calc!B17",
      },
    };
  }

  async function loadTaxParameters(url = "data/tax-parameters-2026.json") {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Could not load tax parameters from ${url}`);
    }
    return response.json();
  }

  const api = {
    calculateQuickCalc,
    loadTaxParameters,
    longTermCapitalGainTax,
    marginalRate,
    progressiveTax,
    stateTax,
  };

  root.KellyOTaxEngine = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
}(typeof globalThis !== "undefined" ? globalThis : window));
