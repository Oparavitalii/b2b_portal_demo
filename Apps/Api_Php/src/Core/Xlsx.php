<?php

declare(strict_types=1);

/**
 * Minimal .xlsx writer: one sheet, a bold frozen header row, text and number cells.
 * No library and no ZipArchive (not every host has ext-zip): the zip is written here,
 * deflated with gzdeflate() when zlib is there, stored otherwise.
 */
final class Xlsx
{
    public const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    public const TEXT = 'text';
    public const INT = 'int';
    public const MONEY = 'money';

    /**
     * @param list<array{title:string,type:string,width:int}> $columns
     * @param iterable<list<string|int|float|null>> $rows values in column order; null = empty cell
     */
    public static function build(string $sheetName, array $columns, iterable $rows): string
    {
        $cols = '';
        foreach ($columns as $i => $c) {
            $n = $i + 1;
            $cols .= '<col min="' . $n . '" max="' . $n . '" width="' . $c['width'] . '" customWidth="1"/>';
        }
        $xml = [self::row(1, array_column($columns, 'title'), array_fill(0, count($columns), self::TEXT), true)];
        $r = 1;
        foreach ($rows as $values) {
            $xml[] = self::row(++$r, $values, array_column($columns, 'type'), false);
        }
        $lastCol = self::col(count($columns) - 1);
        $sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
            . '<cols>' . $cols . '</cols>'
            . '<sheetData>' . implode('', $xml) . '</sheetData>'
            . '<autoFilter ref="A1:' . $lastCol . $r . '"/>'
            . '</worksheet>';

        return self::zip([
            '[Content_Types].xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                . '<Default Extension="xml" ContentType="application/xml"/>'
                . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                . '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                . '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
                . '</Types>',
            '_rels/.rels' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
                . '</Relationships>',
            'xl/workbook.xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                . '<sheets><sheet name="' . self::esc(mb_substr($sheetName, 0, 31)) . '" sheetId="1" r:id="rId1"/></sheets>'
                . '<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">\''
                . self::esc(str_replace("'", "''", mb_substr($sheetName, 0, 31))) . '\'!$A$1:$' . $lastCol . '$' . $r . '</definedName></definedNames>'
                . '</workbook>',
            'xl/_rels/workbook.xml.rels' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
                . '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
                . '</Relationships>',
            // Styles: 0 = default, 1 = bold header, 2 = money "# ##0,00".
            'xl/styles.xml' => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                . '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                . '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>'
                . '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
                . '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
                . '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
                . '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
                . '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
                . '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
                . '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>'
                . '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
                . '</styleSheet>',
            'xl/worksheets/sheet1.xml' => $sheet,
        ]);
    }

    /** @param list<string|int|float|null> $values */
    private static function row(int $r, array $values, array $types, bool $header): string
    {
        $out = '<row r="' . $r . '">';
        foreach (array_values($values) as $i => $v) {
            if ($v === null || $v === '') {
                continue;
            }
            $ref = self::col($i) . $r;
            $type = $types[$i] ?? self::TEXT;
            if ($type !== self::TEXT && is_numeric($v)) {
                $style = $type === self::MONEY ? ' s="2"' : '';
                $out .= '<c r="' . $ref . '"' . $style . '><v>' . $v . '</v></c>';
            } else {
                $style = $header ? ' s="1"' : '';
                $out .= '<c r="' . $ref . '" t="inlineStr"' . $style . '><is><t xml:space="preserve">'
                    . self::esc((string) $v) . '</t></is></c>';
            }
        }
        return $out . '</row>';
    }

    /** 0 → A, 25 → Z, 26 → AA. */
    private static function col(int $i): string
    {
        $s = '';
        for ($i++; $i > 0; $i = intdiv($i - 1, 26)) {
            $s = chr(65 + ($i - 1) % 26) . $s;
        }
        return $s;
    }

    /** XML text: escaped, and without control characters XML 1.0 does not allow. */
    private static function esc(string $s): string
    {
        $s = (string) preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $s);
        return htmlspecialchars($s, ENT_XML1 | ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    /** @param array<string,string> $files name → bytes */
    private static function zip(array $files): string
    {
        $deflate = function_exists('gzdeflate');
        $t = getdate();
        $time = ($t['hours'] << 11) | ($t['minutes'] << 5) | intdiv($t['seconds'], 2);
        $date = (max(0, $t['year'] - 1980) << 9) | ($t['mon'] << 5) | $t['mday'];
        $data = '';
        $central = '';
        foreach ($files as $name => $bytes) {
            $crc = crc32($bytes);
            $packed = $deflate ? (string) gzdeflate($bytes, 6) : $bytes;
            $method = $deflate ? 8 : 0;
            $common = pack('vvvvvVVVvv', 20, 0x0800, $method, $time, $date, $crc, strlen($packed), strlen($bytes), strlen($name), 0);
            $offset = strlen($data);
            $data .= "PK\x03\x04" . $common . $name . $packed;
            $central .= "PK\x01\x02" . pack('v', 20) . $common . pack('vvvVV', 0, 0, 0, 0, $offset) . $name;
        }
        return $data . $central . "PK\x05\x06" . pack('vvvvVVv', 0, 0, count($files), count($files), strlen($central), strlen($data), 0);
    }
}
