// Volta os tempos de um edl.json de corte ao tempo da gravação, usando o janela.json do abrir_cortes.cjs.
function noTempoDoBruto(ranges, janelas) {
  return ranges.map((r) => {
    const dentro = janelas.filter((j) => r.start < j.fim && r.end > j.ini);
    if (dentro.length !== 1) throw new Error(`O trecho de ${r.start} a ${r.end} s não cabe num pedaço só da gravação: ajuste o take.`);
    const [j] = dentro;
    const desvio = j.bruto_ini - j.ini;
    return { ...r, start: +(Math.max(r.start, j.ini) + desvio).toFixed(3), end: +(Math.min(r.end, j.fim) + desvio).toFixed(3) };
  });
}

module.exports = { noTempoDoBruto };
