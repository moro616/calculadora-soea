/* =====================================================================
   Motor de cálculo · Calculadora de sueldo SOEA San Lorenzo (CCT 391/04)
   Herramienta independiente y orientativa. No es oficial del SOEA.
   ---------------------------------------------------------------------
   Un único motor para las categorías A–F y los meses jul–dic 2026.
   Funciona en navegador (window.MotorSOEA) y en Node (module.exports).
   ===================================================================== */
(function (root) {
  "use strict";

  const CATS = ["A", "B", "C", "D", "E", "F"];
  const MESES = ["jul", "ago", "sep", "oct", "nov", "dic"];

  /* ---------- Escala salarial (imagen "Nueva escala 2026" SOEA) ---------- */
  // Básico conformado de junio 2026: base de los incrementos de jul y sep.
  const CONF_JUN = { A: 2400038, B: 2576514, C: 2792668, D: 3020618, E: 3734098, F: 4059415 };
  // Totales publicados (referencia para validar): jun × 1,10 y jun × 1,16.
  const PUB_JUL = { A: 2640042, B: 2834165, C: 3071935, D: 3322680, E: 4107508, F: 4465357 };
  const PUB_SEP = { A: 2784045, B: 2988756, C: 3239494, D: 3503917, E: 4331555, F: 4708930 };
  // Diciembre: todo remunerativo, informado por componentes.
  const DIC_BASICO = { A: 2698368, B: 2896804, C: 3139475, D: 3396255, E: 4141925, F: 4507841 };
  const DIC_ADIC_200514 = 44349; // igual para todas las categorías
  const DIC_ADIC_150615 = { A: 41327, B: 47603, C: 55671, D: 63313, E: 145280, F: 156741 };
  const DIC_CONF_PUB = PUB_SEP; // la imagen publica el mismo conformado que sep

  // Presentismo publicado (ya incluye la actualización del acuerdo).
  const PRES = { jul: 256152, ago: 256152, sep: 270123, oct: 270123, nov: 270123, dic: 270123 };
  // Presentismo de junio inferido: 256.152 / 1,10 = 232.865,45 y 270.123 / 1,16 = 232.864,66.
  const PRES_JUN = 232865;

  // Incrementos NR sobre el conformado de junio (no se acumulan: 10% + 6% = 16%).
  const NR_PCT = { jul: 0.10, ago: 0.10, sep: 0.16, oct: 0.16, nov: 0.16, dic: 0 };

  // Retención extraordinaria art. 51 CCT 391/04: 40% del 10% de julio en 2 cuotas.
  const RET_ART51 = { A: 48000, B: 51500, C: 55850, D: 60400, E: 74682, F: 81189 };
  const RET_MESES = { ago: "Cuota 1/2", sep: "Cuota 2/2" };

  /* ---------- Topes de aportes (base imponible máxima ANSES) ---------- */
  const TOPE = {
    jul: 4509567.41, // Res. ANSES 186/2026
    ago: 4594798.23, // Res. ANSES 232/2026
    sep: 4691748.47, // Res. ANSES 257/2026
    oct: 4769631.49, // Res. ANSES 284/2026
    nov: 4769631.49, // pendiente de publicación: se usa el de octubre
    dic: 4769631.49  // pendiente de publicación: se usa el de octubre
  };
  const TOPE_PENDIENTE = { nov: true, dic: true };

  /* ---------- Ganancias 2026 (ARCA, valores anuales a diciembre) ---------- */
  const GAN = {
    mni: 5585736.93,
    conyuge: 5260643.86,
    hijo: 2652961.90,
    hijoIncap: 5305923.78,
    espEmpleado: 26811537.29
  };
  const TRAMOS = [
    { hasta: 2168491.89, fijo: 0, pct: 0.05 },
    { hasta: 4336983.77, fijo: 108424.59, pct: 0.09 },
    { hasta: 6505475.65, fijo: 303588.86, pct: 0.12 },
    { hasta: 9758213.49, fijo: 563807.89, pct: 0.15 },
    { hasta: 19516426.99, fijo: 1051718.57, pct: 0.19 },
    { hasta: 29274640.48, fijo: 2905779.13, pct: 0.23 },
    { hasta: 43911960.73, fijo: 5150168.23, pct: 0.27 },
    { hasta: 65867941.10, fijo: 9102244.70, pct: 0.31 },
    { hasta: Infinity, fijo: 15908598.62, pct: 0.35 }
  ];

  const MES_NOMBRE = { jul: "Julio 2026", ago: "Agosto 2026", sep: "Septiembre 2026", oct: "Octubre 2026", nov: "Noviembre 2026", dic: "Diciembre 2026" };

  /* ---------- Utilidades ---------- */
  const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100; // redondeo a centavos por línea

  function impuestoArt94(baseAnual) {
    if (!(baseAnual > 0)) return 0;
    let piso = 0;
    for (const t of TRAMOS) {
      if (baseAnual <= t.hasta) return t.fijo + (baseAnual - piso) * t.pct;
      piso = t.hasta;
    }
    return 0;
  }

  /* ---------- Validación ---------- */
  const DEFAULTS = {
    mes: "oct", cat: "A", ant: 0, turno: 0, titulo: 0,
    empresaModo: "pct", empresaValor: 0, presentismo: true,
    he50: 0, he100: 0, feriados: 0, horasJornada: 8, divisor: 172,
    dLey: true, dSoea: true, dRet: true, aportesNR: false, otrosDesc: 0,
    ganModo: "estimada", ganManual: 0, conyuge: false, hijos: 0, hijosIncap: 0, pctHijos: 100
  };

  function validar(raw) {
    const errores = [];
    const v = Object.assign({}, DEFAULTS);
    const num = (k, min, max, entero) => {
      if (raw[k] === undefined || raw[k] === null || raw[k] === "") return;
      const n = typeof raw[k] === "number" ? raw[k] : Number(String(raw[k]).replace(",", "."));
      if (!Number.isFinite(n)) { errores.push({ campo: k, msg: "Debe ser un número válido." }); return; }
      if (n < min) { errores.push({ campo: k, msg: `No puede ser menor que ${min}.` }); return; }
      if (n > max) { errores.push({ campo: k, msg: `No puede ser mayor que ${max}.` }); return; }
      if (entero && !Number.isInteger(n)) { errores.push({ campo: k, msg: "Debe ser un número entero." }); return; }
      v[k] = n;
    };
    const bool = k => { if (raw[k] !== undefined) v[k] = !!raw[k]; };

    if (raw.mes !== undefined) { if (MESES.includes(raw.mes)) v.mes = raw.mes; else errores.push({ campo: "mes", msg: "Mes inexistente." }); }
    if (raw.cat !== undefined) { if (CATS.includes(raw.cat)) v.cat = raw.cat; else errores.push({ campo: "cat", msg: "Categoría inexistente." }); }
    if (raw.turno !== undefined) { if ([0, 18, 30].includes(Number(raw.turno))) v.turno = Number(raw.turno); else errores.push({ campo: "turno", msg: "Turno inválido." }); }
    if (raw.titulo !== undefined) { if ([0, 3, 6].includes(Number(raw.titulo))) v.titulo = Number(raw.titulo); else errores.push({ campo: "titulo", msg: "Título inválido." }); }
    if (raw.empresaModo !== undefined) { if (["pct", "fijo"].includes(raw.empresaModo)) v.empresaModo = raw.empresaModo; else errores.push({ campo: "empresaModo", msg: "Modo inválido." }); }
    if (raw.ganModo !== undefined) { if (["estimada", "manual", "no"].includes(raw.ganModo)) v.ganModo = raw.ganModo; else errores.push({ campo: "ganModo", msg: "Modo inválido." }); }
    if (raw.pctHijos !== undefined) { if ([50, 100].includes(Number(raw.pctHijos))) v.pctHijos = Number(raw.pctHijos); else errores.push({ campo: "pctHijos", msg: "Debe ser 50% o 100%." }); }

    num("ant", 0, 50, true);
    num("empresaValor", 0, raw.empresaModo === "fijo" ? 100000000 : 100, false);
    num("he50", 0, 300, false);
    num("he100", 0, 300, false);
    num("feriados", 0, 31, true);
    num("horasJornada", 1, 24, false);
    num("divisor", 100, 300, false);
    num("otrosDesc", 0, 100000000, false);
    num("ganManual", 0, 100000000, false);
    num("hijos", 0, 15, true);
    num("hijosIncap", 0, 15, true);
    ["presentismo", "dLey", "dSoea", "dRet", "aportesNR", "conyuge"].forEach(bool);
    return { datos: v, errores };
  }

  /* ---------- Cálculo principal ---------- */
  function calcular(raw) {
    const { datos: d, errores } = validar(raw || {});
    if (errores.length) return { ok: false, errores };

    const mes = d.mes, cat = d.cat;
    const esDic = mes === "dic";
    const nrPct = NR_PCT[mes];

    // Base remunerativa de los adicionales (básico conformado)
    let basRem, lineasBasico;
    if (esDic) {
      const b = DIC_BASICO[cat], a1 = DIC_ADIC_200514, a2 = DIC_ADIC_150615[cat];
      basRem = b + a1 + a2;
      lineasBasico = [
        { k: "Básico", v: b, t: "R", g: "basico" },
        { k: "Adicional acuerdo 20-05-14", v: a1, t: "R", g: "basico" },
        { k: "Adicional acuerdo 15-06-15", v: a2, t: "R", g: "basico" }
      ];
    } else {
      basRem = CONF_JUN[cat];
      lineasBasico = [{ k: "Básico conformado (jun-26)", v: basRem, t: "R", g: "basico" }];
    }

    // Adicionales porcentuales sobre básico conformado (remunerativos)
    const pAnt = d.ant * 0.01, pTur = d.turno / 100, pTit = d.titulo / 100;
    const antR = r2(basRem * pAnt), turR = r2(basRem * pTur), titR = r2(basRem * pTit);

    // Adicional de empresa: % del básico conformado o importe fijo. No recibe el incremento NR.
    const empR = d.empresaModo === "pct" ? r2(basRem * d.empresaValor / 100) : r2(d.empresaValor);

    // Incremento NR: 10% (jul) y +6% (sep) sobre el conformado de junio, que impacta antigüedad,
    // turnos y título. Se usa el importe PUBLICADO del período (la tabla redondea distinto en E y F):
    // NR del básico = conformado publicado − conformado de junio.
    let nrBasico = 0;
    if (!esDic) {
      const pub = (mes === "jul" || mes === "ago") ? PUB_JUL[cat] : PUB_SEP[cat];
      nrBasico = r2(pub - basRem);
    }
    const nrAnt = r2(nrBasico * pAnt), nrTur = r2(nrBasico * pTur), nrTit = r2(nrBasico * pTit);
    void nrPct; // NR_PCT queda como referencia documental (10% / 16%)

    // Presentismo: importe publicado. Jul–nov: parte remunerativa = presentismo de junio.
    let presR = 0, presNR = 0;
    if (d.presentismo) {
      if (esDic) presR = PRES.dic;
      else { presR = PRES_JUN; presNR = PRES[mes] - PRES_JUN; }
    }

    // Horas extra y feriados (valor hora = conceptos habituales ÷ divisor)
    const habR = basRem + antR + turR + titR + empR;
    const habNR = nrBasico + nrAnt + nrTur + nrTit;
    const vhR = habR / d.divisor, vhNR = habNR / d.divisor;
    const he50R = r2(vhR * 1.5 * d.he50), he50NR = r2(vhNR * 1.5 * d.he50);
    const he100R = r2(vhR * 2 * d.he100), he100NR = r2(vhNR * 2 * d.he100);
    // Feriado trabajado (mensualizado, LCT art. 166): el día ya está en el mensual; se suma una jornada más.
    const ferR = r2(vhR * d.horasJornada * d.feriados), ferNR = r2(vhNR * d.horasJornada * d.feriados);

    const haberes = lineasBasico.slice();
    const push = (k, v, t, g) => { if (v > 0) haberes.push({ k, v, t, g }); };
    push(`Antigüedad (${d.ant} ${d.ant === 1 ? "año" : "años"} × 1%)`, antR, "R", "adic");
    push(`Turnos rotativos (${d.turno}%)`, turR, "R", "adic");
    push(`Título (${d.titulo}%)`, titR, "R", "adic");
    push(d.empresaModo === "pct" ? `Adicional empresa (${d.empresaValor}%)` : "Adicional empresa (fijo)", empR, "R", "adic");
    push("Presentismo", presR, "R", "adic");
    push(`Horas extra 50% (${d.he50} h)`, he50R, "R", "extra");
    push(`Horas extra 100% (${d.he100} h)`, he100R, "R", "extra");
    push(`Feriados trabajados (${d.feriados} × ${d.horasJornada} h)`, ferR, "R", "extra");

    if (!esDic) {
      const etq = mes === "jul" || mes === "ago" ? "10% jul-26" : "10% jul + 6% sep";
      push(`Incremento NR sobre básico (${etq})`, nrBasico, "NR", "nr");
      push("Incremento NR sobre adicionales", r2(nrAnt + nrTur + nrTit), "NR", "nr");
      push("Actualización presentismo (NR)", presNR, "NR", "nr");
      push("Incremento NR sobre horas extra y feriados", r2(he50NR + he100NR + ferNR), "NR", "nr");
    }

    const totalR = r2(haberes.filter(x => x.t === "R").reduce((a, x) => a + x.v, 0));
    const totalNR = r2(haberes.filter(x => x.t === "NR").reduce((a, x) => a + x.v, 0));
    const bruto = r2(totalR + totalNR);

    /* ---- Descuentos del trabajador ---- */
    const ded = [];
    const tope = TOPE[mes];
    const baseLey = Math.min(totalR, tope);
    const baseOS = Math.min(totalR + (d.aportesNR ? totalNR : 0), tope);
    const baseSind = totalR + (d.aportesNR ? totalNR : 0);
    let aportesDeducibles = 0;
    if (d.dLey) {
      const j = r2(baseLey * 0.11), i = r2(baseLey * 0.03), os = r2(baseOS * 0.03);
      ded.push({ k: "Jubilación (11%)", v: j, g: "ley", base: baseLey });
      ded.push({ k: "INSSJP · Ley 19.032 (3%)", v: i, g: "ley", base: baseLey });
      ded.push({ k: "Obra social (3%)", v: os, g: "ley", base: baseOS });
      aportesDeducibles += j + i + os;
    }
    if (d.dSoea) {
      const cs = r2(baseSind * 0.02), ss = r2(baseSind * 0.015);
      ded.push({ k: "Cuota sindical SOEA (2%)", v: cs, g: "soea", base: baseSind });
      ded.push({ k: "Seguro de sepelio (1,5%)", v: ss, g: "soea", base: baseSind });
      aportesDeducibles += cs + ss;
    }
    if (d.dRet && RET_MESES[mes]) {
      ded.push({ k: `Retención extraordinaria art. 51 (${RET_MESES[mes]})`, v: RET_ART51[cat], g: "ret" });
    }
    if (d.otrosDesc > 0) ded.push({ k: "Otros descuentos", v: r2(d.otrosDesc), g: "otros" });

    /* ---- Ganancias ---- */
    let gan = { modo: d.ganModo, monto: 0, detalle: null };
    if (d.ganModo === "manual") {
      gan.monto = r2(d.ganManual);
      ded.push({ k: "Impuesto a las Ganancias (ingresado)", v: gan.monto, g: "gan" });
    } else if (d.ganModo === "estimada") {
      // Supuesto: el mes se repite todo el año + SAC prorrateado (13 sueldos).
      // Las sumas NR y las horas extra se consideran gravadas.
      const netoMes = bruto - aportesDeducibles;
      const gananciaAnual = netoMes * 13;
      let deducciones = GAN.mni + GAN.espEmpleado;
      if (d.conyuge) deducciones += GAN.conyuge;
      const factorHijos = d.pctHijos / 100;
      deducciones += d.hijos * GAN.hijo * factorHijos + d.hijosIncap * GAN.hijoIncap * factorHijos;
      const baseImponible = Math.max(0, gananciaAnual - deducciones);
      const impAnual = impuestoArt94(baseImponible);
      gan.monto = r2(impAnual / 12);
      gan.detalle = { gananciaAnual: r2(gananciaAnual), deducciones: r2(deducciones), baseImponible: r2(baseImponible), impAnual: r2(impAnual) };
      ded.push({ k: "Impuesto a las Ganancias (estimado)", v: gan.monto, g: "gan", sinRetencion: gan.monto === 0 });
    }

    const totalDed = r2(ded.reduce((a, x) => a + x.v, 0));
    const neto = r2(bruto - totalDed);

    return {
      ok: true, datos: d, mes, mesNombre: MES_NOMBRE[mes], cat,
      basRem, haberes, totalR, totalNR, bruto,
      ded, totalDed, neto, gan,
      valorHora: r2(vhR + vhNR), tope, topePendiente: !!TOPE_PENDIENTE[mes],
      topeAplicado: d.dLey && (totalR > tope || (d.aportesNR && totalR + totalNR > tope))
    };
  }

  const API = {
    calcular, validar, impuestoArt94, r2,
    CATS, MESES, MES_NOMBRE, CONF_JUN, PUB_JUL, PUB_SEP, DIC_BASICO, DIC_ADIC_200514, DIC_ADIC_150615,
    DIC_CONF_PUB, PRES, PRES_JUN, NR_PCT, RET_ART51, RET_MESES, TOPE, TOPE_PENDIENTE, GAN, TRAMOS, DEFAULTS
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.MotorSOEA = API;
})(typeof window !== "undefined" ? window : globalThis);
