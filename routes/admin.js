
var fl = require('flux-link');
var db = require('db-filters');
var _ = require('underscore');
var dust = require('dustjs-linkedin');
require('dustjs-helpers');

var audit = require('../lib/audit.js');
var privs = require('../lib/privs.js');

/**
 * For now the modify account priv is the master site priv that identifies access to
 * the admin menus
 */
var admin_preamble = new fl.Chain(
	function(env, after) {
		if (!privs.hasPriv(env.user.privs, privs.MODIFY_ACCOUNT)) {
			env.$throw(new Error('You are not allowed to be here.'));
			return;
		}

		after();
	}
);

/**
 * Admin index page just lists menu options
 */
var admin_index = new fl.Chain(
	function(env, after) {
		env.$template('admin_index');
		after();
	}
);

/**
 * Retrieve entries from the audit log and display them
 */
var get_audit = new fl.Chain(
	function(env, after) {
		var count = parseInt(env.req.body.count) || 100;
		var offset = parseInt(env.req.body.start) || 0;

		env.$output({
			count : count,
			offset : offset
		});
		env.filters.audit.select({})
			.limit(offset, count)
			.order(db.$desc('id'))
			.exec(after, env.$throw);
	},
	function(env, after, results) {
		env.$template('admin_audit');
		env.$output({
			audit : results
		});
		after();
	}
);

var loadPrivs = new fl.Chain(
	function(env, after) {
		env.filters.privs.insert({
			steamid : env.user.steamid,
			priv : privs.MODIFY_ACCOUNT
		}).exec(after, env.$throw);
	},
	function(env, after) {
		env.filters.privs.insert({
			steamid : env.user.steamid,
			priv : privs.MODIFY_SEASON
		}).exec(after, env.$throw);
	},
	function(env, after) {
		env.filters.privs.insert({
			steamid : env.user.steamid,
			priv : privs.JOIN_SEASON
		}).exec(after, env.$throw);
	},
	function(env, after) {
		env.filters.privs.insert({
			steamid : env.user.steamid,
			priv : privs.VIEW_PRIVS
		}).exec(after, env.$throw);
	},
	function(env, after) {
		env.filters.privs.insert({
			steamid : env.user.steamid,
			priv : privs.VOUCH
		}).exec(after, env.$throw);
	},
	function(env, after) {
		env.filters.privs.insert({
			steamid : env.user.steamid,
			priv : privs.POST_NEWS
		}).exec(after, env.$throw);
	}
);

var bootstrap = new fl.Chain(
	new fl.Branch(
		privs.isLoggedIn,
		// Logged in
		new fl.Chain(
			function (env, after) {
				env.filters.privs.select().exec(after, env.$throw);
			},
			function(env, after, rows) {
				if (0 == rows.length) {
					loadPrivs.call(null, env, after);
				}
				else {
					after();
				}
			}
		),
		// Not logged in
		function (env, after) {
			after();
		}
	),
	function (env, after) {
		env.$redirect('/');
		after();
	}
);

module.exports.init_routes = function(server) {
	server.add_pre_hook(admin_preamble, 'admin');

	server.add_route('/admin/bootstrap', {
		fn : bootstrap,
		pre : ['default'],
		post : ['default'],
	}, 'get');

	server.add_route('/admin', {
		fn : admin_index,
		pre : ['default', 'require_user', 'admin'],
		post : ['default']
	}, 'get');

	server.add_route('/admin/audit', {
		fn : get_audit,
		pre : ['default', 'require_user', 'admin'],
		post : ['default']
	}, 'post');

	server.add_dust_helpers({
		audit_action : function(chunk, context, bodies, params) {
			var action = parseInt(dust.helpers.tap(params.action, chunk, context));

			var match = _.filter(audit.eventList, {id : action});
			if (match.length > 0) {
				chunk.write(match[0].label);
			}
			else {
				chunk.write('No event matching '+action+' found--this is a bug.');
			}

			return chunk;
		},

		audit_target : function(chunk, context, bodies, params) {
			var target = dust.helpers.tap(params.target, chunk, context);
			var type = parseInt(dust.helpers.tap(params.type, chunk, context));

			if (audit.TARGET_USER == type) {
				chunk.write('User '+target);
			}
			else if (audit.TARGET_SEASON == type) {
				chunk.write('Season '+target);
			}
			else if (audit.TARGET_TEAM == type) {
				chunk.write('Team '+target);
			}
			else if (audit.TARGET_MATCH == type) {
				chunk.write('Match '+target);
			}
			else {
				chunk.write('Unrecognized target type '+type);
			}

			return chunk;
		}
	});
}
