/**
 * Wrapper module for loading mysql and configuring it with the database, etc.
 * This also acts to ensure that the singleton instance is initialized only
 * once.
 */

// Module information
var mod_name = 'MySQL';
var mod_version = '0.6.0';

// Node.js modules
require('colors');
var _ = require('underscore');
var mysql = require('mysql2');
var db = require('db-filters');
var db_migrate = require('db-migrate');

// Project modules
var logger = require('./logger');
var config = require('./config.js');

var initialized = false;
var pool = {};

/**
 * Retrieves a connection and filters for errors to reduce the amount of repeated
 * glue-like code in the calling context. Uses the environment handlers for
 * consistency with the rest of the framework
 */
function getValidConnection(env, after) {
	pool.getConnection(function(err, conn) {
		if (err) {
			err._msg = 'Error connecting to MySQL database.';
			env.$throw(err);
		}
		else {
			env.conn = conn;
			after();
		}
	});
}

/**
 * Singleton cleanup function, called on process exit
 * @param cb The callback to chain to
 */
function deinit(cb) {
	if (initialized) {
		logger.info('Closing connection pool.', mod_name);
		initialized = false;
		pool.end(cb);
	}
}

/**
 * Singleton initialization function, called whereever. This will also populate the
 * database filters and will check for new migrations
 */
function init() {
	if (!initialized) {
		pool = mysql.createPool(config.mysql);
		initialized = true;
		logger.module_init(mod_name, mod_version, 'Configured MySQL connection pool');
		logger.info('Using database '+config.mysql.database.green.bold, mod_name);

		// Load database filter definitions
		db.init(process.cwd() + '/' + config.filter_dir, function(file) {
			logger.info('Adding database definition ' + file.blue.bold + '...', 'db-filters');
		}, db.l_info);

		db.set_log(function(msg) {
			logger.info(msg, 'db-filters');
		});

		// Check for and run database migrations
		migrations = db_migrate.getInstance(true, {
			config : {
				dev : {
					driver : 'mysql',
					user : config.mysql.user,
					password : config.mysql.password,
					host : config.mysql.host,
					database : config.mysql.database,
					multipleStatements : true,
				},
				"sql-file" : true
			}
		});

		migrations.up().then(function() {
			logger.info('Finished running db migrations', 'db-migrate');
		});

	}
}

/**
 * Cleans up the database connection assigned to a specific environment/request
 */
function cleanup_db(env, after) {
	if (env.conn) {
		env.conn.release();
		delete env.conn;
	}
	after();
}

/**
 * Initialize database connection from the mysql pool for a specific environment/request
 */
function init_db(env, after) {
	env.filters = db.clone_filters(db.filters);

	getValidConnection(env, function() {
		db.set_conn_all(env.conn, env.filters);
		after();
	});
}

// Public interface for the module and the class
module.exports = {
	init : init,
	cleanup : deinit,
	getValidConnection : getValidConnection,
	init_db : init_db,
	cleanup_db : cleanup_db
};
