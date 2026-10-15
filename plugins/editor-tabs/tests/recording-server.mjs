import { appendFileSync } from 'node:fs';
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node';
const trace = process.argv[2];
const record = value => appendFileSync(trace, JSON.stringify({ pid: process.pid, ...value }) + '\n');
const connection = createMessageConnection(new StreamMessageReader(process.stdin), new StreamMessageWriter(process.stdout));
let options;
const documents = new Set();
connection.onRequest('initialize', params => {
  options = params.initializationOptions;
  record({ event: 'initialize', cwd: process.cwd(), params });
  return { capabilities: { definitionProvider: true, referencesProvider: true } };
});
connection.onNotification('textDocument/didOpen', params => documents.add(params.textDocument.uri));
connection.onNotification('textDocument/didClose', params => documents.delete(params.textDocument.uri));
connection.onRequest('textDocument/definition', params => {
  record({ event: 'query', documents: [...documents] });
  return { uri: options?.target ?? params.textDocument.uri, range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } };
});
connection.listen();
