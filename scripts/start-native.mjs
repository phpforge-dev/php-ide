import { runCommand } from './run-command.mjs';

const executable = process.platform === 'darwin'
  ? 'src-tauri/target/release/bundle/macos/PHP IDE.app/Contents/MacOS/php-ide'
  : `src-tauri/target/release/php-ide${process.platform === 'win32' ? '.exe' : ''}`;
const child = runCommand(executable, []);
child.once('error', () => console.error('Execute npm run build antes de iniciar.'));
