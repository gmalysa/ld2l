/**
 * Force add a bunch of signups to the site for some given steam32 ids
 */

let _ = require('underscore');
let db = require('db-filters');
let fl = require('flux-link');

let config = require('./config.js');
let logger = require('./logger');
let mysql = require('./mysql');
let users = require('./lib/users.js');

// Database static init before doing other stuff
mysql.init();
db.init(process.cwd() + '/filters', function(file) {
	logger.info('Adding database definition ' + file.blue.bold + '...', 'db-filters');
}, db.l_info);

db.set_log(function(msg) {
	logger.info(msg, 'db-filters');
});


let env = new fl.Environment();
let ids = [];

let chain = new fl.Chain(
	mysql.init_db,
	users.createUsers,
	mysql.cleanup_db
);

chain.call(null, env, function() { logger.info('Finished'); }, ids);
