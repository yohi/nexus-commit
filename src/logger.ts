import pc from 'picocolors';

export const logger = {
  info(msg: string): void {
    console.log(`${pc.blue('ℹ')} ${msg}`);
  },
  warn(msg: string): void {
    console.warn(`${pc.yellow('⚠')} ${msg}`);
  },
  error(msg: string): void {
    console.error(`${pc.red('✖')} ${msg}`);
  },
  dim(msg: string): void {
    console.log(pc.dim(msg));
  },
};
