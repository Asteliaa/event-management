// Простейший CSV (разделитель «;», понятный Excel в русской локали) с BOM для UTF-8
const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const toCsv = (columns, rows) =>
    '\uFEFF' + [columns.map((c) => cell(c.title)).join(';'),
        ...rows.map((r) => columns.map((c) => cell(c.value(r))).join(';'))].join('\r\n');

module.exports = { toCsv };
