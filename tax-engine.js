(function (root) {
  const STATUS_LABELS = new Set(["Single", "MFJ", "HoH", "MFS"]);

  function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function toNonNegativeNumber(value) {
    return Math.max(0, toNumber(value));
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

  function standardDeduction(filingStatus, parameters) {
    return toNonNegativeNumber(parameters.federal.standardDeductions[filingStatus]?.amount);
  }

  function statusAmount(table, filingStatus, fallback = 0) {
    const item = table?.[filingStatus];
    if (typeof item === "number") return item;
    if (item && typeof item.amount === "number") return item.amount;
    if (item && typeof item.threshold === "number") return item.threshold;
    if (item && typeof item.start === "number") return item.start;
    return fallback;
  }

  function calculateSaltDeduction(input, parameters) {
    const filingStatus = normalizeFilingStatus(input.filingStatus);
    const salt = parameters.federal.saltCap;
    const agi = toNumber(input.agi);
    const paid = toNonNegativeNumber(input.saltPaid);
    const cap = statusAmount(salt.caps, filingStatus);
    const phaseDownThreshold = statusAmount(salt.phaseDownThresholds, filingStatus);
    const floor = filingStatus === "MFS" ? salt.mfsFloor : salt.defaultFloor;
    const phaseDown = Math.max(0, agi - phaseDownThreshold) * salt.phaseDownRate;
    const effectiveCap = Math.max(floor, cap - phaseDown);
    return {
      saltPaid: roundMoney(paid),
      saltCap: roundMoney(cap),
      phaseDown: roundMoney(phaseDown),
      effectiveSaltCap: roundMoney(effectiveCap),
      allowedSaltDeduction: roundMoney(Math.min(paid, effectiveCap)),
    };
  }

  function calculateSelfEmploymentTax(input, parameters) {
    const se = parameters.federal.selfEmploymentTax;
    const netSelfEmploymentIncome = toNonNegativeNumber(input.netSelfEmploymentIncome);
    const payrollFicaWages = toNonNegativeNumber(input.payrollFicaWages);
    const taxableEarnings = netSelfEmploymentIncome * se.factor;
    if (taxableEarnings <= 0) {
      return {
        netSelfEmploymentIncome: 0,
        selfEmploymentTaxableEarnings: 0,
        selfEmploymentTax: 0,
        deductibleSelfEmploymentTax: 0,
      };
    }
    const socialSecurityBaseRemaining = Math.max(0, se.socialSecurityWageBase - payrollFicaWages);
    const socialSecurityTax = Math.min(taxableEarnings, socialSecurityBaseRemaining) * se.socialSecurityRate;
    const medicareTax = taxableEarnings * se.medicareRate;
    const tax = socialSecurityTax + medicareTax;
    return {
      netSelfEmploymentIncome: roundMoney(netSelfEmploymentIncome),
      selfEmploymentTaxableEarnings: roundMoney(taxableEarnings),
      selfEmploymentTax: roundMoney(tax),
      deductibleSelfEmploymentTax: roundMoney(tax / 2),
    };
  }

  function calculateQbiDeduction(input, parameters) {
    const qbi = parameters.federal.qbi;
    const qbiBase = toNumber(input.qbiBase);
    const taxableIncomeBeforeQbi = toNonNegativeNumber(input.taxableIncomeBeforeQbi);
    const longTermCapitalGains = toNonNegativeNumber(input.longTermCapitalGains);
    const tentative = Math.max(0, qbiBase) * qbi.deductionRate;
    const taxableIncomeCap = Math.max(0, taxableIncomeBeforeQbi - longTermCapitalGains) * qbi.deductionRate;
    return {
      qbiBase: roundMoney(qbiBase),
      tentativeQbiDeduction: roundMoney(tentative),
      taxableIncomeQbiCap: roundMoney(taxableIncomeCap),
      qbiDeduction: roundMoney(Math.min(tentative, taxableIncomeCap)),
    };
  }

  function calculateNiitAndAdditionalMedicare(input, parameters) {
    const filingStatus = normalizeFilingStatus(input.filingStatus);
    const niit = parameters.federal.niitAndAdditionalMedicare;
    const threshold = statusAmount(niit.thresholds, filingStatus);
    const agi = toNumber(input.agi);
    const netInvestmentIncome =
      toNonNegativeNumber(input.interest) +
      toNonNegativeNumber(input.ordinaryDividends) +
      toNonNegativeNumber(input.longTermCapitalGains) +
      toNonNegativeNumber(input.rentalIncome);
    const niitTax = Math.min(netInvestmentIncome, Math.max(0, agi - threshold)) * niit.niitRate;
    const earnedIncome =
      toNonNegativeNumber(input.wages) +
      toNonNegativeNumber(input.scheduleCIncome);
    const additionalMedicareTax = Math.max(0, earnedIncome - threshold) * niit.additionalMedicareRate;
    return {
      netInvestmentIncome: roundMoney(netInvestmentIncome),
      niitTax: roundMoney(niitTax),
      additionalMedicareTax: roundMoney(additionalMedicareTax),
      niitAndAdditionalMedicareTax: roundMoney(niitTax + additionalMedicareTax),
    };
  }

  function calculateCoreProjection(input, parameters) {
    const filingStatus = normalizeFilingStatus(input.filingStatus);
    const strategy = input.strategyDeductions || {};
    const adjustments = input.adjustments || {};
    const itemized = input.itemizedDeductions || {};

    const wages = toNonNegativeNumber(input.wages);
    const payrollFicaWages = toNonNegativeNumber(input.payrollFicaWages ?? wages);
    const interest = toNonNegativeNumber(input.interest);
    const ordinaryDividends = toNonNegativeNumber(input.ordinaryDividends);
    const retirementDistributions = toNonNegativeNumber(input.retirementDistributions);
    const pensionsAnnuities = toNonNegativeNumber(input.pensionsAnnuities);
    const taxableSocialSecurity = toNonNegativeNumber(input.taxableSocialSecurity);
    const longTermCapitalGains = toNonNegativeNumber(input.longTermCapitalGains);
    const scheduleCIncome = toNumber(input.scheduleCIncome);
    const rentalIncome = toNumber(input.rentalIncome);
    const k1Income = toNumber(input.k1Income);
    const rothConversionIncome = toNonNegativeNumber(input.rothConversionIncome);
    const otherCapitalEventGains = toNumber(input.otherCapitalEventGains);

    const augustaDeduction = toNonNegativeNumber(strategy.augusta ?? input.augustaDeduction);
    const accountablePlanDeduction = toNonNegativeNumber(strategy.accountablePlan ?? input.accountablePlanDeduction);
    const familyWagesDeduction = toNonNegativeNumber(strategy.familyWages ?? input.familyWagesDeduction);
    const requestedCostSegDeduction = toNonNegativeNumber(
      strategy.costSegAcceleratedDepreciation ?? input.costSegAcceleratedDepreciation
    );
    const preDepreciationBusinessIncome =
      scheduleCIncome + rentalIncome + k1Income - augustaDeduction - accountablePlanDeduction - familyWagesDeduction;
    const ebl = parameters.federal.excessBusinessLoss;
    const eblThreshold = filingStatus === "MFJ" ? ebl.mfjThreshold : ebl.otherThreshold;
    const allowedCostSegRow = Math.max(-requestedCostSegDeduction, -eblThreshold - preDepreciationBusinessIncome);
    const allowedCostSegDeduction = Math.abs(allowedCostSegRow);
    const disallowedExcessBusinessLoss = Math.max(0, requestedCostSegDeduction - allowedCostSegDeduction);
    const totalStrategyDeductions =
      augustaDeduction + accountablePlanDeduction + familyWagesDeduction + allowedCostSegDeduction;

    const netSelfEmploymentIncome = Math.max(
      0,
      scheduleCIncome - augustaDeduction - accountablePlanDeduction - familyWagesDeduction - allowedCostSegDeduction
    );
    const selfEmployment = calculateSelfEmploymentTax({ netSelfEmploymentIncome, payrollFicaWages }, parameters);
    const seHealthInsurance = toNonNegativeNumber(adjustments.seHealthInsurance ?? input.seHealthInsurance);
    const hsaContributions = toNonNegativeNumber(adjustments.hsaContributions ?? input.hsaContributions);
    const retirementContributions = toNonNegativeNumber(
      adjustments.retirementContributions ?? input.retirementContributions
    );
    const totalAdjustments =
      seHealthInsurance + hsaContributions + retirementContributions + selfEmployment.deductibleSelfEmploymentTax;

    const incomeBeforeAdjustments =
      wages +
      interest +
      ordinaryDividends +
      retirementDistributions +
      pensionsAnnuities +
      taxableSocialSecurity +
      longTermCapitalGains +
      scheduleCIncome +
      rentalIncome +
      k1Income +
      rothConversionIncome +
      otherCapitalEventGains -
      totalStrategyDeductions;
    const agi = incomeBeforeAdjustments - totalAdjustments;

    const standardDeductionAmount = standardDeduction(filingStatus, parameters);
    const salt = calculateSaltDeduction(
      {
        filingStatus,
        agi,
        saltPaid: itemized.saltPaid ?? input.saltPaid,
      },
      parameters
    );
    const mortgageInterest = toNonNegativeNumber(itemized.mortgageInterest ?? input.mortgageInterest);
    const investmentInterest = toNonNegativeNumber(itemized.investmentInterest ?? input.investmentInterest);
    const charitableDonations = toNonNegativeNumber(itemized.charitableDonations ?? input.charitableDonations);
    const totalItemizedDeductions =
      salt.allowedSaltDeduction + mortgageInterest + investmentInterest + charitableDonations;
    const deductionUsed = Math.max(standardDeductionAmount, totalItemizedDeductions);
    const deductionMethod = totalItemizedDeductions > standardDeductionAmount ? "itemized" : "standard";
    const taxableIncomeBeforeQbi = Math.max(0, agi - deductionUsed);

    const qbi = calculateQbiDeduction(
      {
        qbiBase: scheduleCIncome + k1Income - totalStrategyDeductions - seHealthInsurance - selfEmployment.deductibleSelfEmploymentTax,
        taxableIncomeBeforeQbi,
        longTermCapitalGains,
      },
      parameters
    );

    const taxableIncome = Math.max(0, agi - qbi.qbiDeduction - deductionUsed);
    const ordinaryTaxableIncome = Math.max(0, taxableIncome - longTermCapitalGains);
    const brackets = parameters.federal.ordinaryBrackets[filingStatus];
    const federalOrdinaryTax = progressiveTax(ordinaryTaxableIncome, brackets);
    const federalLongTermCapitalGainsTax = longTermCapitalGainTax(
      { filingStatus, ordinaryIncome: ordinaryTaxableIncome, longTermCapitalGains },
      parameters
    );
    const niit = calculateNiitAndAdditionalMedicare(
      {
        filingStatus,
        agi,
        wages,
        scheduleCIncome,
        interest,
        ordinaryDividends,
        longTermCapitalGains,
        rentalIncome,
      },
      parameters
    );
    const federalTaxBeforeCredits =
      federalOrdinaryTax +
      federalLongTermCapitalGainsTax +
      selfEmployment.selfEmploymentTax +
      niit.niitAndAdditionalMedicareTax;
    const federalCredits = toNonNegativeNumber(input.federalCredits);
    const federalTaxAfterCredits = Math.max(0, federalTaxBeforeCredits - federalCredits);
    const calculatedStateTax = stateTax({ state: input.state || "None", totalTaxableIncome: agi }, parameters);
    const combinedTax = federalTaxAfterCredits + calculatedStateTax;

    return {
      filingStatus,
      state: input.state || "None",
      wages: roundMoney(wages),
      incomeBeforeAdjustments: roundMoney(incomeBeforeAdjustments),
      totalAdjustments: roundMoney(totalAdjustments),
      adjustedGrossIncome: roundMoney(agi),
      standardDeduction: roundMoney(standardDeductionAmount),
      allowedSaltDeduction: salt.allowedSaltDeduction,
      totalItemizedDeductions: roundMoney(totalItemizedDeductions),
      deductionUsed: roundMoney(deductionUsed),
      deductionMethod,
      qbiBase: qbi.qbiBase,
      qbiDeduction: qbi.qbiDeduction,
      taxableIncomeBeforeQbi: roundMoney(taxableIncomeBeforeQbi),
      taxableIncome: roundMoney(taxableIncome),
      ordinaryTaxableIncome: roundMoney(ordinaryTaxableIncome),
      longTermCapitalGains: roundMoney(longTermCapitalGains),
      federalOrdinaryTax: roundMoney(federalOrdinaryTax),
      federalLongTermCapitalGainsTax: roundMoney(federalLongTermCapitalGainsTax),
      selfEmploymentTax: selfEmployment.selfEmploymentTax,
      deductibleSelfEmploymentTax: selfEmployment.deductibleSelfEmploymentTax,
      niitAndAdditionalMedicareTax: niit.niitAndAdditionalMedicareTax,
      federalTaxBeforeCredits: roundMoney(federalTaxBeforeCredits),
      federalCredits: roundMoney(federalCredits),
      federalTaxAfterCredits: roundMoney(federalTaxAfterCredits),
      federalMarginalRate: marginalRate(ordinaryTaxableIncome, brackets),
      federalEffectiveRate: taxableIncome ? federalTaxAfterCredits / taxableIncome : 0,
      stateTax: roundMoney(calculatedStateTax),
      combinedTax: roundMoney(combinedTax),
      combinedEffectiveRate: taxableIncome ? combinedTax / taxableIncome : 0,
      quarterlyInstallment: roundMoney(combinedTax / 4),
      allowedCostSegDeduction: roundMoney(allowedCostSegDeduction),
      disallowedExcessBusinessLoss: roundMoney(disallowedExcessBusinessLoss),
      sourceCells: {
        adjustedGrossIncome: "Qtrly Calc!G26",
        qbiDeduction: "Qtrly Calc!G27",
        standardDeduction: "Qtrly Calc!G28",
        itemizedDeductions: "Qtrly Calc!G29:G34",
        taxableIncome: "Qtrly Calc!G35",
        federalTaxBeforeCredits: "Qtrly Calc!G38:G42",
        stateTax: "Qtrly Calc!G47",
        excessBusinessLoss: "Qtrly Calc!G20; Tax Parameters!B81:B82",
      },
    };
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
    calculateCoreProjection,
    calculateNiitAndAdditionalMedicare,
    calculateQbiDeduction,
    calculateQuickCalc,
    calculateSaltDeduction,
    calculateSelfEmploymentTax,
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
