
import { type as os_type } from 'os';
import Darwin from './Darwin';
import IPlatform from './IPlatform';
import Windows_NT from './Windows_NT';

/*
platform = 'aix'
    | 'android'
    | 'darwin'
    | 'freebsd'
    | 'linux'
    | 'openbsd'
    | 'sunos'
    | 'win32'
    | 'cygwin'
    | 'netbsd';

arch = 'arm', 'arm64', 'ia32', 'mips', 'mipsel', 'ppc', 'ppc64', 's390', 's390x', 'x32', and 'x64'.

type = 
  Darwin,
  Linux,
  Windows_NT
*/

const supported = {
  Darwin,
  Windows_NT,
};

export default class Environment {
  private static instance: IPlatform;
  private constructor() { }

  public static getInstance() {
    if (!Environment.instance) {
      const className = os_type();
      console.log('className', className);
      Environment.instance = <IPlatform>new supported[className]();
    }

    return Environment.instance;
  }
}