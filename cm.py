from itertools import combinations
from dist_metrics import cluster_dist
from objects import Match
import sys
from munkres import Munkres # NOTE THAT THIS NEEDS TO BE PIP INSTALLED
import networkx as nx


m = Munkres()


def clump(pong, dist_metric, sim_threshold, greedy):
	'''
	Here, the boolean passed into match_clusters represents fixed_K, 
		meaning we're comparing runs with the same number of clusters.
	
	Note: In the base case, we entered the while loop with 2 unique runs left.
		Then, either they were identical and we combined them and now 
		len(unique_runs) = 0, OR they weren't and there's still one left.
		The other base case is that there was only 1 run to begin with.
		In this case, we would never have entered the while loop, and we
		likewise need to add the one entry of unique_runs to rep_runs.
	'''
	for kgroup in pong.all_kgroups:
		kgroup.all_runs = sorted(kgroup.all_runs)
		all_runs = kgroup.all_runs
		e = []
		G = nx.Graph()
		count = 0
		for run in all_runs:
			for r in all_runs[count:]:
				if r != run:
					match = match_clusters(pong, pong.runs[run].data, 
						pong.runs[r].data, kgroup.K, dist_metric, True )
					
					add_cluster_match(pong, run, r, match )


					labels = sorted(match.to_nodes)
					mat = [[1-match.edges[(x+1, y)] for y in labels] for x in range(len(labels))]

					indexes = m.compute(mat)
					total = 0.0
					for row, column in indexes:
						value = 1-mat[row][column]
						total += value
					average = total/len(indexes)
					match.sim = average

					# add match to graph if avg is above sim_threshold
					if average > sim_threshold:
						e.append((run, r, average))
				else:
					e.append((run, r, 1))

			count +=1
		G.add_weighted_edges_from(e)


		cliques = sorted(list(nx.find_cliques(G)), key=lambda d : len(d), reverse=True)
		cliques = [sorted(x) for x in cliques]
		if not is_disjoint(cliques, len(kgroup.all_runs)):
			sys.stdout.write('\nWarning: pong could not find disjoint modes given similarity threshold.\n')
			if not greedy:
				r = input('Continue matching using greedy algorithm (y/n): ')
				while r not in ('y', 'Y', 'n', 'N'):
					r = input('Please enter "y" to use greedy algorithm or '
							'"n" to exit: ')
				if r in ('n', 'N'): sys.exit('Could not find disjoint modes. Consider increasing the similarity threshold.\n')
			
			greedy_cliques = []
			num_cliques_in_graph = len(kgroup.all_runs)
			while (not is_disjoint(cliques, num_cliques_in_graph)):
				
				greedy_cliques.append(cliques[0])
				num_cliques_in_graph -= len(cliques[0])
				for r in cliques[0]:
					G.remove_node(r)
				new_cliques = sorted(list(nx.find_cliques(G)), key=lambda d : len(d), reverse=True)
				cliques = [sorted(x) for x in new_cliques]
			cliques = greedy_cliques + cliques

		kgroup.primary_run = cliques[0][0]
		index = all_runs.index(cliques[0][0])
		if index != 0:
			for run in all_runs[:index]:
				match = pong.cluster_matches[run][kgroup.primary_run]
				opp_match = Match()
				opp_match.sim = match.sim
				opp_match.to_nodes = match.to_nodes
				opp_match.from_nodes = match.from_nodes

				opp_match.edges = {(x[1][0], (x[0],)):match.edges[x] for x in match.edges}
				# opp_match.perm = [match.perm.index(x+1)+1 for x in range(len(match.perm))]

				add_cluster_match(pong, kgroup.primary_run, run, opp_match )

			kgroup.all_runs.remove(cliques[0][0])
			kgroup.all_runs.insert(0, cliques[0][0])

		for mode in cliques:
			kgroup.rep_runs.append(mode[0])
			for run in mode[1:]:
				pong.runs[mode[0]].sim_runs.append(run)
				pong.runs[run].represented_by = mode[0]

		pl = ""
		if len(kgroup.all_runs) > 1:
			pl = "s"
			
		# print number of unique clustering solutions
		if len(kgroup.rep_runs) == 1:
			print('For K=%d, there is 1 mode across %d run%s.' % (kgroup.K, len(kgroup.all_runs), pl))
		else:
			data = (kgroup.K, len(kgroup.rep_runs), len(kgroup.all_runs), pl)
			print('For K=%d, there are %d modes across %d run%s.' % data)

	pong.sort_by = cliques[0][0]


def is_disjoint(clique_list, num_runs):
	total = sum([len(x) for x in clique_list])
	if total == num_runs:
		return True
	else:
		return False

def multicluster_match(pong, dist_metric):
	runs, all_kgroups = pong.runs, pong.all_kgroups
	'''
	Here, the boolean passed into match_clusters represents fixed_K, meaning
	we're comparing runs with different values of K (i.e. K is not fixed).
	'''
	# for each K except K_max
	for i in range(len(all_kgroups)-1):
		run1 = all_kgroups[i].primary_run
		run2 = all_kgroups[i+1].primary_run
		match = match_clusters(pong, runs[run1].data, runs[run2].data, 
			all_kgroups[i].K, dist_metric, False)
				
		add_cluster_match(pong, run1, run2, match)



def match_clusters(pong, run1, run2, K, dist_metric, fixed_K):
	'''
	nodes are either cluster vecs or conglomerates of multiple cluster vecs.

	edges[i] corresponds with the (i+1)th cluster in run1, and is itself a set 
	of edges between the (i+1)th cluster in run1 and nodes (=clusters or 
	conglomerates of clusters) in run2. It is implemented as a list of tuples,
	each of which having the form (edge_weight, node_id).

	node_id is itself a tuple, either containing one number (the run2 cluster 
	number) or two (the two clusters in run2 constituting the node)

	e.g. edges = [ [ (0.99,(1,)), (0.87,(2,3)), ...], [ (0.98,(2,)),...],...]

	FIGURE OUT OVERALL Q MATRIX SIMILARITY: assuming you pick the best cluster 
	match in run2 for each cluster in run1, how similar are the two matrices?
	This information is used by clump() to determine multimodality and
	condense the dataset.
	'''
	match = Match()

	# GENERATE NETWORK GRAPH AND EDGE WEIGHTS
	cluster_num = 1
	for n1 in run1:

		for i, n2 in enumerate(run2):
			weight = cluster_dist(pong, n1, n2, K, dist_metric)
			cluster_id = (i+1,) # must include comma so we know it's a tuple
			match.edges[(cluster_num, cluster_id)] = weight
			match.to_nodes.add(cluster_id)


		# INCLUDE HYBRID NODES FOR MATCHING RUNS ACROSS K
		if not fixed_K:
			# combs = []
			# for i in range(2,(len(run2)+1 if all_cluster_mixtures else 3)):
			# 	combs += [x for x in combinations(range(len(run2)),i)]
			# combs = [x for x in combinations(range(len(run2)), 2)]

			for c1, c2 in combinations(list(range(len(run2))), 2):
				n2 = run2[c1]+run2[c2]
				weight = cluster_dist(pong, n1, n2, K, dist_metric)
				cluster_id = (c1+1, c2+1)
				match.edges[(cluster_num, cluster_id)] = weight
				match.to_nodes.add(cluster_id)

		match.from_nodes.add(cluster_num)
		cluster_num += 1


	''' TODO: POTENTIAL PROBLEM = what if there's only 1 match (K=1 or 
	something) then there won't be a n1[1][0]
	'''
	# match.compute_sim_and_dif()

	return match






def add_cluster_match(pong, id1, id2, data):
	'''
	Adds cluster matching details (network graph) between 2 runs
	to the cluster_matches dictionary.

	"data" is of the form (edges, sim, dif)
	'''
	try:
		pong.cluster_matches[id1][id2] = data
	except KeyError:
		pong.cluster_matches[id1] = {id2: data}






