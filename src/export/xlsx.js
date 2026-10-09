/* CCPG — Écriture d'un classeur Excel (.xlsx) sans bibliothèque externe, et téléchargement. */
"use strict";

// ---- Écriture d'un classeur .xlsx (zip non compressé de fichiers XML), sans bibliothèque externe
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Archive zip « stockée » (sans compression) : [{ nom, contenu (texte) }] → Uint8Array. */
function zipStocke(fichiers) {
  const enc = new TextEncoder();
  const locaux = [];
  const centraux = [];
  let offset = 0;
  for (const f of fichiers) {
    const nom = enc.encode(f.nom);
    const data = enc.encode(f.contenu);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // noms en UTF-8
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nom.length, true);
    locaux.push(new Uint8Array(local.buffer), nom, data);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, nom.length, true);
    central.setUint32(42, offset, true);
    centraux.push(new Uint8Array(central.buffer), nom);
    offset += 30 + nom.length + data.length;
  }
  const tailleCentral = centraux.reduce((a, b) => a + b.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, fichiers.length, true);
  fin.setUint16(10, fichiers.length, true);
  fin.setUint32(12, tailleCentral, true);
  fin.setUint32(16, offset, true);
  const parts = [...locaux, ...centraux, new Uint8Array(fin.buffer)];
  const out = new Uint8Array(parts.reduce((a, b) => a + b.length, 0));
  let p = 0;
  for (const part of parts) { out.set(part, p); p += part.length; }
  return out;
}

/**
 * Classeur Excel. Chaque feuille : { nom, lignes, cols?, fusions?, hauteurs?, figer?, paysage? }.
 * Une cellule est une valeur (texte / nombre) ou { v, s } avec s = { bold, sz, color, fill, align, wrap, border }.
 */
function xlsxClasseur(feuilles) {
  const x = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  const col = (i) => { let s = ""; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
  const noms = new Set();
  const nomFeuille = (nom) => {
    const base = String(nom).replace(/[\\/?*[\]:]/g, "-").slice(0, 31) || "Feuille";
    let n = base;
    for (let i = 2; noms.has(n.toLowerCase()); i++) n = `${base.slice(0, 28)} ${i}`;
    noms.add(n.toLowerCase());
    return n;
  };

  // Styles : polices, remplissages et formats de cellule dédoublonnés
  const polices = ['<font><sz val="11"/><name val="Calibri"/></font>'];
  const remplissages = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  const formats = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  const index = (liste, xml) => { let i = liste.indexOf(xml); if (i < 0) { liste.push(xml); i = liste.length - 1; } return i; };
  const style = (s) => {
    if (!s) return 0;
    const font = index(polices, `<font>${s.bold ? "<b/>" : ""}<sz val="${s.sz || 11}"/>${s.color ? `<color rgb="FF${s.color}"/>` : ""}<name val="Calibri"/></font>`);
    const fill = s.fill ? index(remplissages, `<fill><patternFill patternType="solid"><fgColor rgb="FF${s.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const align = s.align || s.wrap ? `<alignment${s.align ? ` horizontal="${s.align}"` : ""} vertical="center"${s.wrap ? ' wrapText="1"' : ""}/>` : "";
    return index(formats, `<xf numFmtId="0" fontId="${font}" fillId="${fill}" borderId="${s.border ? 1 : 0}" xfId="0" applyFont="1" applyFill="1" applyBorder="1"${align ? ` applyAlignment="1">${align}</xf>` : "/>"}`);
  };
  const cellule = (c, ref) => {
    const { v, s } = c != null && typeof c === "object" ? c : { v: c, s: null };
    const st = style(s);
    const a = st ? ` s="${st}"` : "";
    if (v == null || v === "") return st ? `<c r="${ref}"${a}/>` : "";
    if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${a}><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${a}><is><t xml:space="preserve">${x(v)}</t></is></c>`;
  };

  const fichiersFeuilles = feuilles.map((f, fi) => {
    const lignes = f.lignes.map((l, li) => {
      const h = f.hauteurs && f.hauteurs[li + 1];
      return `<row r="${li + 1}"${h ? ` ht="${h}" customHeight="1"` : ""}>${l.map((c, ci) => cellule(c, `${col(ci)}${li + 1}`)).join("")}</row>`;
    }).join("");
    const largeurs = f.cols || (f.lignes[0] || []).map((_, ci) => ({ w: Math.min(48, Math.max(6, ...f.lignes.map((l) => String((l[ci] && l[ci].v !== undefined ? l[ci].v : l[ci]) ?? "").length + 2))) }));
    const fig = f.figer || { lignes: 1, colonnes: 0 };
    const pane = fig.lignes || fig.colonnes
      ? `<pane${fig.colonnes ? ` xSplit="${fig.colonnes}"` : ""}${fig.lignes ? ` ySplit="${fig.lignes}"` : ""} topLeftCell="${col(fig.colonnes)}${fig.lignes + 1}" activePane="${fig.colonnes && fig.lignes ? "bottomRight" : fig.lignes ? "bottomLeft" : "topRight"}" state="frozen"/>`
      : "";
    return {
      nom: `xl/worksheets/sheet${fi + 1}.xml`,
      contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>
${largeurs.length ? `<cols>${largeurs.map((c, ci) => `<col min="${ci + 1}" max="${ci + 1}" width="${c.w}" customWidth="1"${c.hidden ? ' hidden="1"' : ""}/>`).join("")}</cols>` : ""}
<sheetData>${lignes}</sheetData>
${f.fusions && f.fusions.length ? `<mergeCells count="${f.fusions.length}">${f.fusions.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : ""}
<pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.2" footer="0.2"/>
${f.paysage ? '<pageSetup paperSize="9" orientation="landscape" fitToHeight="0"/>' : ""}
</worksheet>`,
    };
  });
  const sheets = feuilles.map((f, i) => `<sheet name="${x(nomFeuille(f.nom))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
  return zipStocke([
    {
      nom: "[Content_Types].xml",
      contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${feuilles.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
</Types>`,
    },
    {
      nom: "_rels/.rels",
      contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      nom: "xl/workbook.xml",
      contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`,
    },
    {
      nom: "xl/_rels/workbook.xml.rels",
      contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${feuilles.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${feuilles.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    ...fichiersFeuilles,
    {
      // Styles construits au fil des feuilles : écrits en dernier
      nom: "xl/styles.xml",
      contenu: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="${polices.length}">${polices.join("")}</fonts>
<fills count="${remplissages.length}">${remplissages.join("")}</fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${formats.length}">${formats.join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`,
    },
  ]);
}

function telecharger(octets, nom, type) {
  const url = URL.createObjectURL(new Blob([octets], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
