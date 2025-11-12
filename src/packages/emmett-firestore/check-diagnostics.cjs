const ts = require('typescript');
const path = require('path');

const configPath = path.join(__dirname, 'tsconfig.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, __dirname);

const host = ts.createCompilerHost(parsed.options);
const program = ts.createProgram(parsed.fileNames, parsed.options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);

const file = 'src/eventStore/storage/aggregateStream.ts';
diagnostics
  .filter(d => d.file && d.file.fileName.includes(file))
  .forEach(d => {
    const { line, character } = d.file.getLineAndCharacterOfPosition(d.start);
    console.log(`Line ${line + 1}: ${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`);
  });
