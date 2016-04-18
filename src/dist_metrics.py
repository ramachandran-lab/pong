import numpy as np


def cluster_dist(pong, c1, c2, K, dist_metric):
	'''
	find similarity between two nodes (which are either clusters or pairs
	of clusters)
	
	note that C = num_indiv

	distance metrics:
		- sum_squared
		- percent (absolute distance)
		- G (G(Q_i, Q_j) from CLUMPP/CLUMPAK which uses
			the frobenius matrix norm)
	'''
	# return np.sum(np.abs(c1-c2))/C

	if dist_metric=='sum_squared':
		return 1-np.sum((c1-c2)**2)/pong.num_indiv
	
	elif dist_metric=='percent':
		return 1-np.sum(np.abs(c1-c2))/pong.num_indiv

	elif dist_metric=='G':
		return 1-np.sqrt(np.sum((c1-c2)**2))/np.sqrt(2*pong.num_indiv)

	elif dist_metric=='jaccard':
		# threshold could be K-dependent (e.g. 10% of 1/10K)
		threshold = 0.1/K # could add option to choose threshold
		j = [c1[i]-c2[i] for i,x in enumerate(c1+c2) if x >= threshold]
		return 1 - np.sqrt(np.sum(np.array(j)**2))/np.sqrt(2*len(j))

	else:
		sys.exit('Encountered invalid distance metric in cluster_dist().'
			'This should not happen; user input has already been checked.')




def jaccard_dist(c1, c2, K):
	'''
	Hamming distance: proportion of difference
	Jaccard distance: proportion of difference where at least one indiv 
	has an entry

	NOTE this is now deprecated; wrote a more optimized version and put 
	it directly in cluster_dist
	'''
	threshold = 0.1/K
	nonzero_indices = [i for i,x in enumerate(c1+c2) if x >= threshold]

	num_indiv = len(nonzero_indices)

	c1_nonzero = np.array([c1[i] for i in nonzero_indices])
	c2_nonzero = np.array([c2[i] for i in nonzero_indices])

	# now, compute G
	return np.sqrt(np.sum((c1_nonzero-c2_nonzero)**2))/np.sqrt(2*num_indiv)

