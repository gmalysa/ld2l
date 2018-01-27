# Setup instructions

## Manual installation steps

You need to do some things manually for now
* Install Node.js
* Install MySQL

## Global npm packages

You need to have several packages installed globally to build the site (i.e. with `make`) for
deployment:
* uglifyjs
* less
* less-plugin-clean-css
* showdown

You need the db-migrate packages to create new db migrations (i.e. during development)
* db-migrate
* db-migrate-mysql

## Scripts

These will install node dependencies and configure mysql for us, if you meet some prereqs:

* Configure your local root mysql user to have no password, or use `mysql -u root -p` below

```
$ npm install
### With no root mysql password installed:
# mysql < setup.sql
```

### DB Migration
db migration scripts are run automatically at server startup if necessary. To create a new db
migration, if things are updated, install `db-migrate` and `db-migrate-mysql` globally, configure a
database.json in the local folder, and use

```bash
db-migrate create whatever-name
```

to generate the skeleton. Paste the appropriate SQL for changes into
migrations/sql/<date>-whatever-name.sql
