If your organization does not let you turn off quarantine, it holds messages and sends you an annoying email occasionally.
You can run this script on your homeserver to automatically handle that email message, release the messages, let them filter through to your normal Junk folder, and see them.

##

* Any messages that are marked read will be left untouched.
* After processing will be marked read and moved to a folder called `notifications` (customization wanted, please PR).

## Quickstart

Note you will temporarily paste the password into plaintext into your terminal, but if you press C-d to finish entering the pasword, it should be covered by your prompt.
Adding a better password handling is desired, please PR.

```
$ npm install
$ export BINKI_DCX_EMAIL_USER=user@example.org
$ export BINKI_DCX_EMAIL_PASSWORD=$(cat); printf '\r'
$ npm start
```
