import process from 'process';
import dotenvByenv from 'dotenv-byenv';
import Imap from 'node-imap';
import ss from 'stream-to-string';
import {
  HTMLElement,
  parse as parseHtml,
} from 'node-html-parser';
import {
  MailParser,
} from 'mailparser-mit';
import fetch from 'node-fetch';

dotenvByenv.config();

const boxName = 'INBOX';

const requireEnv = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Must set ${name}`);
  }
  return value;
}

const user = requireEnv('BINKI_DCX_EMAIL_USER');
const password = requireEnv('BINKI_DCX_EMAIL_PASSWORD');

const imap = new Imap({
  user,
  password,
  host: 'imap-mail.outlook.com',
  port: 993,
  tls: true,
});

const runLockedAsync = (() => {
  let last:Promise<any> = Promise.resolve();
  return <T>(fAsync:()=>Promise<T>) => {
    const nextPromise = last.catch(() => {
    }).then(() => fAsync());
    last = nextPromise;
    return nextPromise;
  };
})();

imap.once('ready', () => {
  console.log(`connected. Opening ${boxName}`);
  imap.openBox(boxName, (ex:any, box:any) => {
    if (ex) throw ex;

    const checkMailAsync = () => runLockedAsync(async () => {
      console.log(`[${new Date()}] Checking mail…`);
      const results = await new Promise<number[]>((resolve, reject) => imap.search(['UNSEEN', ['FROM', 'quarantine@messaging.microsoft.com']], (ex:any, results:any) => {
        if (ex) throw reject(ex);
        resolve(results);
      }));
      console.log(`results: ${results}`);
      // Invalid to fetch nothing.
      if (!results.length) return;
      await new Promise((resolve, reject) => {
        const imapFetch = imap.fetch(results, {
          bodies: '',
        });
        let lastMessageHandler = Promise.resolve();
        imapFetch.once('message', (message:any) => {
          const attributesPromise = new Promise<any>(resolve => message.on('attributes', resolve));
          message.on('body', (stream:any, info:any) => {
            void info;
            lastMessageHandler = lastMessageHandler.then(async () => {
              const mail = await new Promise<{headers:any,mail:any}>((resolve, reject) => {
                const mailParser = new MailParser();
                let headers:any;
                mailParser.on('headers', (h:any) => headers = h);
                mailParser.on('end', (mail:any) => {
                  resolve({
                    headers,
                    mail,
                  });
                })
                mailParser.on('error', reject);
                stream.pipe(mailParser);;
              });
              const {
                html,
              } = mail.mail;
              const rootElement = parseHtml(html, {
                lowerCaseTagName: true,
              });
              const uid = (await attributesPromise).uid;
              console.log(`uid=${uid}`);
              for (const element of rootElement.getElementsByTagName('a')) {
                if (/release/.test(element.textContent.toLowerCase())) {
                  const href = element.getAttribute('href');
                  if (href !== undefined) {
                    const response = await fetch(href);
                    if (response.status >= 400) {
                      throw new Error(`Unexpected response code ${response.status}: ${await response.text()}`);
                    }
                    console.log(`Released a message.`);
                  }
                }
              }
              await new Promise<void>((resolve, reject) => imap.addFlags(uid, '\\Seen', (ex:any) => {
                if (ex) reject(ex);
                else resolve();
              }));
              await new Promise<void>((resolve, reject) => imap.move(uid, 'notifications', (ex:any) => {
                if (ex) reject(ex);
                else resolve();
              }));
            });
          })
          message.once('end', () => {
            console.log(`Done message`);
          });
        });
        imapFetch.once('end', () => lastMessageHandler.then(() => resolve(undefined), reject));
        imapFetch.once('error', reject);
      });
    });

    imap.on('mail', () => {
      checkMailAsync();
    });
    checkMailAsync();
  });
});

imap.once('error', (ex: any) => {
  console.error(ex);
});

imap.once('end', () => {
  console.log('Connection ended');
});

const stop = () => {
  console.log('stop requested');
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
  runLockedAsync(async () => {
    imap.end();
  });
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

imap.connect();
