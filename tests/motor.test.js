/* Pruebas del motor · ejecutar con: node tests/motor.test.js
   Las referencias son independientes de las fórmulas del motor:
   - importes PUBLICADOS en la escala SOEA (no recalculados),
   - retención art. 51 = 40% del 10% de julio / 2 cuotas (regla del acuerdo),
   - Ganancias contra valores calculados aparte (tests/ganancias_ref.json, generado en Python). */
const M = require("../motor.js");
const fs = require("fs");
const path = require("path");

let ok = 0, fail = 0;
const fallos = [];
function check(nombre, cond, info) {
  if (cond) ok++; else { fail++; fallos.push(nombre + (info ? " → " + info : "")); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const sum = arr => arr.reduce((a, x) => a + x.v, 0);

/* 1. Las 36 combinaciones mes × categoría (sin adicionales, sin presentismo, sin extras) */
const tabla = [];
for (const cat of M.CATS) {
  const fila = { cat };
  for (const mes of M.MESES) {
    const r = M.calcular({ mes, cat, presentismo: false, ganModo: "no" });
    check(`${mes}/${cat} ok`, r.ok);
    // Total del básico (rem + NR) vs. importe publicado
    let pub;
    if (mes === "jul" || mes === "ago") pub = M.PUB_JUL[cat];
    else if (mes === "dic") pub = M.DIC_BASICO[cat] + M.DIC_ADIC_200514 + M.DIC_ADIC_150615[cat];
    else pub = M.PUB_SEP[cat];
    check(`${mes}/${cat} básico total = publicado ±1`, near(r.bruto, pub, 1), `${r.bruto} vs ${pub}`);
    // Naturaleza: jul–nov remunerativo = conformado junio; dic todo remunerativo
    if (mes === "dic") check(`${mes}/${cat} sin NR`, r.totalNR === 0);
    else check(`${mes}/${cat} remunerativo = conf. junio`, r.totalR === M.CONF_JUN[cat], `${r.totalR}`);
    // Retención solo en ago y sep
    const ret = r.ded.find(x => x.g === "ret");
    if (mes === "ago" || mes === "sep") {
      check(`${mes}/${cat} tiene retención`, !!ret);
      const ref = M.CONF_JUN[cat] * 0.10 * 0.40 / 2;
      check(`${mes}/${cat} retención ≈ 40%×10%/2`, ret && near(ret.v, ref, 35), `${ret && ret.v} vs ${ref.toFixed(2)}`);
    } else check(`${mes}/${cat} sin retención`, !ret);
    // Conciliación
    check(`${mes}/${cat} haberes concilian`, near(sum(r.haberes), r.bruto, 0.005));
    check(`${mes}/${cat} neto concilia`, near(r.bruto - sum(r.ded), r.neto, 0.005));
    fila[mes] = r.bruto;
  }
  tabla.push(fila);
}

/* 2. El 6% de septiembre NO se compone sobre julio */
for (const cat of M.CATS) {
  const r = M.calcular({ mes: "sep", cat, presentismo: false, ganModo: "no" });
  const compuesto = M.PUB_JUL[cat] * 1.06;
  check(`sep/${cat} no compuesto`, Math.abs(r.bruto - compuesto) > 1000, `${r.bruto} vs ${compuesto}`);
}

/* 3. Diciembre: adicionales sobre el conformado (básico + 2 adicionales) */
for (const cat of M.CATS) {
  const r = M.calcular({ mes: "dic", cat, ant: 10, turno: 30, titulo: 6, presentismo: false, ganModo: "no" });
  const conf = M.DIC_BASICO[cat] + M.DIC_ADIC_200514 + M.DIC_ADIC_150615[cat];
  const esperado = conf * (1 + 0.10 + 0.30 + 0.06);
  check(`dic/${cat} adicionales sobre conformado`, near(r.bruto, esperado, 0.05), `${r.bruto} vs ${esperado}`);
}

/* 4. Jul–nov: adicionales reciben el NR (total = conf. publicado × (1+%)) */
for (const cat of M.CATS) for (const mes of ["jul", "sep"]) {
  const r = M.calcular({ mes, cat, ant: 5, turno: 18, titulo: 3, presentismo: false, ganModo: "no" });
  const pub = mes === "jul" ? M.PUB_JUL[cat] : M.PUB_SEP[cat];
  check(`${mes}/${cat} adicionales con NR`, near(r.bruto, pub * 1.26, 3), `${r.bruto} vs ${pub * 1.26}`);
}

/* 5. Presentismo = importe publicado del mes */
for (const mes of M.MESES) {
  const a = M.calcular({ mes, cat: "B", presentismo: true, ganModo: "no" });
  const b = M.calcular({ mes, cat: "B", presentismo: false, ganModo: "no" });
  check(`${mes} presentismo publicado`, near(a.bruto - b.bruto, M.PRES[mes], 0.005), `${a.bruto - b.bruto}`);
}

/* 6. Adicional de empresa: 0 por defecto, % y fijo sin duplicarse, sin NR */
{
  const base = M.calcular({ mes: "oct", cat: "D", presentismo: false, ganModo: "no" });
  const pct = M.calcular({ mes: "oct", cat: "D", presentismo: false, ganModo: "no", empresaModo: "pct", empresaValor: 5 });
  const fijo = M.calcular({ mes: "oct", cat: "D", presentismo: false, ganModo: "no", empresaModo: "fijo", empresaValor: 100000 });
  check("empresa 0 por defecto", !base.haberes.some(x => x.k.startsWith("Adicional empresa")));
  check("empresa 5%", near(pct.bruto - base.bruto, M.CONF_JUN.D * 0.05, 0.01));
  check("empresa fijo", near(fijo.bruto - base.bruto, 100000, 0.001));
}

/* 7. Horas extra y feriados */
{
  const o = { mes: "dic", cat: "A", presentismo: false, ganModo: "no", divisor: 200 };
  const b = M.calcular(o), conf = b.bruto;
  const h50 = M.calcular({ ...o, he50: 10.5 }), h100 = M.calcular({ ...o, he100: 4 }), fer = M.calcular({ ...o, feriados: 1, horasJornada: 12 });
  check("HE 50% (10,5 h)", near(h50.bruto - conf, conf / 200 * 1.5 * 10.5, 0.01));
  check("HE 100% (4 h)", near(h100.bruto - conf, conf / 200 * 2 * 4, 0.01));
  check("Feriado = 1 jornada extra (no 2)", near(fer.bruto - conf, conf / 200 * 12, 0.01));
  const oct = M.calcular({ mes: "oct", cat: "A", presentismo: false, ganModo: "no", divisor: 200, he100: 4 });
  const octB = M.calcular({ mes: "oct", cat: "A", presentismo: false, ganModo: "no", divisor: 200 });
  check("HE oct sobre total con NR", near(oct.bruto - octB.bruto, M.PUB_SEP.A / 200 * 8, 1));
}

/* 8. Aportes: base remunerativa y tope ANSES */
{
  const r = M.calcular({ mes: "oct", cat: "C", presentismo: false, ganModo: "no" });
  const j = r.ded.find(x => x.k.startsWith("Jubilación"));
  check("Jubilación solo sobre remunerativo", near(j.v, M.CONF_JUN.C * 0.11, 0.01));
  const nrOn = M.calcular({ mes: "oct", cat: "C", presentismo: false, ganModo: "no", aportesNR: true });
  const os = nrOn.ded.find(x => x.k.startsWith("Obra"));
  check("OS con NR activado", near(os.v, M.PUB_SEP.C * 0.03, 0.05));
  const big = M.calcular({ mes: "dic", cat: "F", ant: 30, turno: 30, presentismo: true, ganModo: "no" });
  const jb = big.ded.find(x => x.k.startsWith("Jubilación"));
  check("Tope ANSES aplicado", near(jb.v, M.TOPE.dic * 0.11, 0.01) && big.topeAplicado);
  const sind = big.ded.find(x => x.k.startsWith("Cuota sindical"));
  check("Sindical sin tope", near(sind.v, big.totalR * 0.02, 0.01));
}

/* 9. Ganancias estimada vs. referencia Python; manual no se suma a la estimada */
const refGan = JSON.parse(fs.readFileSync(path.join(__dirname, "ganancias_ref.json"), "utf8"));
for (const c of refGan) {
  const r = M.calcular(c.input);
  const g = r.ded.find(x => x.g === "gan");
  check(`Ganancias ${c.nombre}`, g && near(g.v, c.esperado, 0.5), `${g && g.v} vs ${c.esperado}`);
}
{
  const man = M.calcular({ mes: "oct", cat: "F", ganModo: "manual", ganManual: 123456.78 });
  const gs = man.ded.filter(x => x.g === "gan");
  check("Ganancias manual única", gs.length === 1 && gs[0].v === 123456.78);
  const low = M.calcular({ mes: "jul", cat: "A", ganModo: "estimada" });
  const g = low.ded.find(x => x.g === "gan");
  check("Cat A jul: sin retención estimada", g.v === 0 && g.sinRetencion);
}

/* 10. Datos inválidos */
const invalidos = [
  { cat: "G" }, { mes: "ene" }, { ant: -1 }, { ant: 2.5 }, { ant: 99 }, { hijos: -2 }, { hijos: 1.5 },
  { he50: -3 }, { he100: "abc" }, { he50: Infinity }, { divisor: 0 }, { turno: 25 }, { titulo: 4 },
  { empresaValor: -5 }, { ganManual: NaN }, { pctHijos: 70 }
];
for (const inp of invalidos) {
  const r = M.calcular(inp);
  check(`inválido ${JSON.stringify(inp)}`, !r.ok && r.errores.length > 0);
}
check("fracción de hora válida", M.calcular({ he50: 2.5 }).ok);
check("coma decimal válida", M.calcular({ he50: "2,5" }).ok);

/* 11. Cambio de categoría no arrastra valores */
{
  const a = M.calcular({ mes: "sep", cat: "A", ant: 3, turno: 18 });
  const f = M.calcular({ mes: "sep", cat: "F", ant: 3, turno: 18 });
  const f2 = M.calcular({ mes: "sep", cat: "F", ant: 3, turno: 18 });
  check("cambio categoría limpio", f.neto === f2.neto && f.neto !== a.neto && f.basRem === M.CONF_JUN.F);
}

/* 12. Diferencias de redondeo de diciembre: documentar */
const difDic = M.CATS.map(c => ({ cat: c, componentes: M.DIC_BASICO[c] + M.DIC_ADIC_200514 + M.DIC_ADIC_150615[c], publicado: M.DIC_CONF_PUB[c] }))
  .map(x => ({ ...x, dif: x.componentes - x.publicado }));

console.log("\nTabla de validación · total básico (rem + NR) por mes, sin adicionales:");
console.table(tabla);
console.log("Diferencias diciembre (suma de componentes − conformado publicado):");
console.table(difDic);
console.log(`\n${ok} pruebas OK · ${fail} fallidas`);
if (fail) { console.log(fallos.join("\n")); process.exit(1); }
