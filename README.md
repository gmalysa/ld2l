# Setup instructions

## Manual installation steps

You need to do some things manually for now
* Install Node.js
* Install MySQL

## Scripts

These will install node dependencies and configure mysql for us, if you meet some prereqs:

* Configure your local root mysql user to have no password, or used `mysql -u root -p` below

```
$ npm install
### With no root mysql password installed:
# mysql < setup.sql
```
