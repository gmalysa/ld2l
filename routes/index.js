/**
 * Route that handles the index/landing page
 */

/**
 * Just show the main page
 */
function index(env, after) {
	env.$template('index');
	env.$output({title : 'Learn Dota 2 League'});
	env.$output({user : env.req.user});
	after();
}

module.exports.init_routes = function(server) {
	server.add_route('/', {
		fn : index,
		pre : ['default'],
		post : ['default']
	}, 'get');
};
