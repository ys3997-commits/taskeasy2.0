import { FREQUENCY_LABELS, type RecurringSchedule } from "@rajshree/shared";
import { formatDate, fullName } from "@/lib/utils";

const COLUMNS = [
  "Tasks",
  "Delegator",
  "Receiver",
  "Start Date",
  "End Date",
  "Frequency",
  "Status",
] as const;

type Column = (typeof COLUMNS)[number];
type ExportRow = Record<Column, string>;

const COLUMN_WIDTHS = [230, 110, 110, 72, 72, 100, 68];

function scheduleStatus(schedule: RecurringSchedule) {
  if (!schedule.is_active) return schedule.is_paused ? "Cancelled" : "Completed";
  return schedule.is_paused ? "Paused" : "Active";
}

function frequencyText(schedule: RecurringSchedule) {
  const label = FREQUENCY_LABELS[schedule.frequency];
  return schedule.interval > 1 ? `${label} / every ${schedule.interval}` : label;
}

function exportRows(schedules: RecurringSchedule[]): ExportRow[] {
  return schedules.map((schedule) => ({
    Tasks: schedule.title,
    Delegator: schedule.delegator ? fullName(schedule.delegator) : "",
    Receiver: schedule.receiver ? fullName(schedule.receiver) : "",
    "Start Date": formatDate(schedule.start_date),
    "End Date": formatDate(schedule.end_date),
    Frequency: frequencyText(schedule),
    Status: scheduleStatus(schedule),
  }));
}

function saveBlob(bytes: BlobPart, filename: string, type: string) {
  const blob = new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function downloadRecurringExcel(schedules: RecurringSchedule[]) {
  const XLSX = await import("xlsx");
  const rows = exportRows(schedules);
  const sheet = XLSX.utils.json_to_sheet(rows, { header: [...COLUMNS] });
  sheet["!cols"] = [
    { wch: 48 },
    { wch: 24 },
    { wch: 24 },
    { wch: 14 },
    { wch: 14 },
    { wch: 24 },
    { wch: 14 },
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Recurring Tasks");
  XLSX.writeFile(book, "recurring-tasks.xlsx");
}

/** Standard PDF fonts cannot draw an em dash. */
function pdfSafe(value: string) {
  const text = value.replaceAll("—", "-").replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
  return text.trim() || "-";
}

function wrapPdfText(
  text: string,
  widthOf: (value: string) => number,
  maxWidth: number
) {
  const words = pdfSafe(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";

  const splitLong = (word: string) => {
    let rest = word;
    while (widthOf(rest) > maxWidth && rest.length > 1) {
      let cut = rest.length;
      while (cut > 1 && widthOf(rest.slice(0, cut)) > maxWidth) cut -= 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    return rest;
  };

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (widthOf(next) <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = splitLong(word);
  }
  if (line) lines.push(line);
  return lines.length ? lines : ["-"];
}

export async function downloadRecurringPdf(schedules: RecurringSchedule[]) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const rows = exportRows(schedules);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const margin = 32;
  const scale =
    (pageWidth - margin * 2) / COLUMN_WIDTHS.reduce((sum, width) => sum + width, 0);
  const widths = COLUMN_WIDTHS.map((width) => width * scale);
  const fontSize = 8;
  const lineHeight = 10;
  const pad = 4;
  const ink = rgb(21 / 255, 26 / 255, 24 / 255);
  const muted = rgb(92 / 255, 102 / 255, 99 / 255);
  const headerFill = rgb(24 / 255, 90 / 255, 61 / 255);
  const lineColor = rgb(217 / 255, 221 / 255, 220 / 255);
  const white = rgb(1, 1, 1);

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const drawHeader = () => {
    const height = 18;
    page.drawRectangle({
      x: margin,
      y: y - height,
      width: pageWidth - margin * 2,
      height,
      color: headerFill,
    });
    let x = margin;
    COLUMNS.forEach((label, index) => {
      page.drawText(label, {
        x: x + pad,
        y: y - 13,
        size: fontSize,
        font: bold,
        color: white,
      });
      x += widths[index];
    });
    y -= height;
  };

  page.drawText("Recurring Tasks", {
    x: margin,
    y: y - 16,
    size: 16,
    font: bold,
    color: ink,
  });
  y -= 22;
  page.drawText(
    `${rows.length} ${rows.length === 1 ? "task" : "tasks"} - ${formatDate(new Date().toISOString())}`,
    { x: margin, y: y - 10, size: 10, font, color: muted }
  );
  y -= 18;
  drawHeader();

  const nextPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
    drawHeader();
  };

  for (const row of rows) {
    const cells = COLUMNS.map((column, index) =>
      wrapPdfText(
        row[column],
        (value) => font.widthOfTextAtSize(value, fontSize),
        Math.max(8, widths[index] - pad * 2)
      )
    );
    const lineCount = Math.max(...cells.map((cell) => cell.length), 1);
    const height = lineCount * lineHeight + pad * 2;
    if (y - height < margin) nextPage();

    page.drawRectangle({
      x: margin,
      y: y - height,
      width: pageWidth - margin * 2,
      height,
      borderColor: lineColor,
      borderWidth: 0.5,
    });

    let x = margin;
    cells.forEach((cellLines, index) => {
      cellLines.forEach((text, lineIndex) => {
        page.drawText(text, {
          x: x + pad,
          y: y - pad - fontSize - lineIndex * lineHeight,
          size: fontSize,
          font,
          color: ink,
        });
      });
      x += widths[index];
    });
    y -= height;
  }

  const bytes = await pdf.save();
  saveBlob(bytes.slice().buffer, "recurring-tasks.pdf", "application/pdf");
}
