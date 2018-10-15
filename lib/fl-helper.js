/**
 * Helper library for things that should be done in flux-link but aren't.
 * This is primarily a meta-programming library file, in that it produces the chains
 * which are then processed in the usual fashion.
 */

var fl = require('flux-link');

/**
 * Create a for loop that increments over the given index
 * @param[in] index Name of the index variable to use
 * @param[in] limit Name of the limit variable to use
 * @param[in] ...rest Arguments to fill the body of the loop chain
 * @return Chain representing this operation
 */
var ForLoop = function(index, limit) {
	var loop = new fl.LoopChain(
		function(env, after) {
			after(env[index] < env[limit]);
		}
	);

	var elems = Array.prototype.slice.call(arguments, 2);
	elems.forEach(function(v) {
		loop.push(v);
	});

	loop.push(function(env, after) {
		env[index] += 1;
		after();
	});

	return new fl.Chain(
		function(env, after) {
			env[index] = 0;
			after();
		},
		loop
	);
}

/**
 * Create a branch chain that only has an if-true side to it
 * @param[in] field Name of the field to test for a truthy value
 * @param[in] ...rest Arguments to fill the body of the true chain
 * @return Chain representing this operation
 */
var IfTrue = function(field) {
	var trueChain = new fl.Chain();

	var elems = Array.prototype.slice.call(arguments, 1);
	elems.forEach(function(v) {
		trueChain.push(v);
	});

	return new fl.Branch(
		function(env, after) {
			after(env[field]);
		},
		trueChain,
		function(env, after) {
			after();
		}
	);
};

module.exports = {
	ForLoop : ForLoop,
	IfTrue : IfTrue
};
