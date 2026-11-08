import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const stem = 'cosmic-signature-white-paper-v1.3';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function main() {
  const source = readFileSync(join(directory, `${stem}.md`));
  const pdfPath = join(directory, `${stem}.pdf`);
  const manifestPath = join(directory, 'artifact-manifest.json');
  if (process.argv.includes('--check')) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest.sourceSha256 !== digest(source) ||
        manifest.pdfSha256 !== digest(readFileSync(pdfPath)) ||
        manifest.buildScriptSha256 !== digest(readFileSync(fileURLToPath(import.meta.url)))) {
      throw new Error('The English paper, build script, PDF, and artifact manifest are out of sync. Rebuild the PDF.');
    }
    console.log('English white paper 1.3 source and PDF digests match.');
    return;
  }
  const temporary = mkdtempSync(join(tmpdir(), 'cosmic-white-paper-'));
  try {
    const headerPath = join(temporary, 'header.tex');
    writeFileSync(headerPath, String.raw`
\usepackage{microtype}
\usepackage{etoolbox}
\usepackage{needspace}
\usepackage{fancyhdr}
\pagestyle{fancy}
\fancyhf{}
\fancyhead[L]{\small Cosmic Signature}
\fancyhead[R]{\small White paper 1.3}
\fancyfoot[C]{\thepage}
\setlength{\headheight}{14pt}
\setlength{\emergencystretch}{3em}
\AtBeginEnvironment{longtable}{\small}
\pretocmd{\section}{\needspace{6\baselineskip}}{}{}
\pretocmd{\subsection}{\needspace{5\baselineskip}}{}{}
\let\originaltableofcontents\tableofcontents
\renewcommand{\tableofcontents}{\originaltableofcontents\clearpage}
`);
    // Resolve repository-relative links against the checked-out branch or detached commit.
    const repositoryRoot = resolve(directory, '../..');
    let sourceRef = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'],
      {cwd: directory, encoding: 'utf8'}).trim();
    if (sourceRef === 'HEAD') {
      sourceRef = execFileSync('git', ['rev-parse', 'HEAD'],
        {cwd: directory, encoding: 'utf8'}).trim();
    }
    let pdfSource = source.toString('utf8').replace(
      /^(\[([^\]]+)\]: )(\.\.\/.+)$/gm,
      (_whole, prefix, label, target) => {
        const repositoryPath = relative(repositoryRoot, resolve(directory, target)).replaceAll('\\', '/');
        return `${prefix}https://github.com/PredictionExplorer/Cosmic-Signature/${label === 'source' ? 'tree' : 'blob'}/${sourceRef}/${repositoryPath}`;
      },
    );
    // Reserve room for these short reference tables instead of leaving a few
    // rows on another page. Content remains identical to the Markdown source.
    pdfSource = pdfSource.replace(/(^#{1,6} [^\n]+\n\n)?((?:^\|.*\|\n)+)/gm, (_whole, heading, table) => {
      const rows = table.trim().split('\n').filter(row => !/^\|[\s:|\-]+\|$/.test(row));
      const columns = rows[0].split('|').length - 2;
      const charactersPerLine = Math.floor(92 / columns);
      const lines = rows.reduce((total, row) => total + Math.max(...row.split('|').slice(1,-1)
        .map(cell => Math.ceil(cell.trim().replace(/`/g,'').length / charactersPerLine))), 0);
      const points = Math.min(620, Math.ceil(lines * 12 + 30 + (heading ? 40 : 0)));
      return `\n\\needspace{${points}pt}\n\n${heading ?? ''}${table}`;
    });
    // Keep a section title with its immediately following subsection title
    // and the start of the text, rather than stranding the parent heading.
    pdfSource = pdfSource.replace(/(^#{1,5} [^\n]+\n\n)(?=^#{2,6} )/gm,
      '\\needspace{10\\baselineskip}\n\n$1');
    const inputPath = join(temporary, `${stem}.md`);
    writeFileSync(inputPath, pdfSource);
    execFileSync('pandoc', [inputPath, '--from=markdown', '--pdf-engine=tectonic',
      '--table-of-contents', '--toc-depth=2', '--include-in-header', headerPath,
      '--variable=monofont:lmmono10-regular.otf', '--variable=monofontoptions:Scale=0.85',
      '--output', pdfPath], {stdio:'inherit'});
    const version = command => execFileSync(command, ['--version'], {encoding:'utf8'}).split('\n')[0];
    writeFileSync(manifestPath, JSON.stringify({
      paperVersion: '1.3', language: 'en', canonicalSource: `${stem}.md`,
      pdf: `${stem}.pdf`, sourceSha256: digest(source), pdfSha256: digest(readFileSync(pdfPath)),
      buildScriptSha256: digest(readFileSync(fileURLToPath(import.meta.url))),
      pandoc: version('pandoc'), tectonic: version('tectonic'),
    }, null, 2) + '\n');
    console.log(`Built ${pdfPath}`);
  } finally {
    rmSync(temporary, {recursive:true, force:true});
  }
}

main();
