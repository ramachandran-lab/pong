import sys
import os
from os import path
import re
import numpy as np
from collections import defaultdict
from objects import Kgroup, Run
import random
import warnings



def parse_multicluster_input(pong, filemap, ignore_cols, col_delim, labels_file, ind2pop):
	error = '\nError parsing input file: could not convert Q-matrix data '
	error += 'entry to float.\nPerhaps the value of `--ignore_first_columns` '
	error += 'is incorrect or a file with a different format was included '
	error += 'somewhere.\n'


	# filemap is in the format: run_id\tK_value\trel/path/to/qmatrix
	try:
		with warnings.catch_warnings():
			warnings.simplefilter("ignore")
			qfiles_info = np.genfromtxt(filemap, delimiter='\t', 
				dtype=[('f0',object), ('f1',int), ('f2',object)],
				loose=False, autostrip=True)
	except ValueError:
		sys.exit('Error parsing filemap: check that the file is tab-'
			'delimited and that the columns are ordered properly.')


	if (qfiles_info.size < 1):
		sys.exit('Error: filemap is empty.')

	if (qfiles_info.size == 1):
		qfiles_info = [(str(qfiles_info['f0']),int(qfiles_info['f1']),str(qfiles_info['f2']))]
		
	krange = sorted({q[1] for q in qfiles_info})

	if krange != range(krange[0], krange[-1]+1):
		sys.exit('Error parsing input files: there must be at least one '
			'Q-matrix for every K in [min_K, max_K]')

	pong.K_min = krange[0]
	pong.K_max = krange[-1]
	pong.all_kgroups = [Kgroup(K) for K in krange]

	if pong.K_min < 2:
		sys.exit('Error: Q matrix with K=%d encountered in filemap, which is not supported by pong. '
			'Make sure all input files have K greater than or equal to 2.' % pong.K_min)

	if pong.K_max > 26 and not pong.colors:
		sys.exit('Pong does not support values of K greater than 26 by default. '
			'Please provide a custom color file with as many colors as the largest '
			'value of K from the Q-matrices.')

	if pong.colors and pong.K_max > len(pong.colors):
		sys.stdout.write('\nWarning: The custom color file provided does not contain enough colors '
			'for visualization. ')
		if pong.K_max < 27:
			r = raw_input('Continue using default colors? (y/n): ')
			while r not in ('y','Y','n','N'):
				r = raw_input('Please enter "y" to overwrite or '
						'"n" to exit: ')
			if r in ('n','N'): sys.exit('Make sure there are as many colors in the color file as the largest '
				'value of K from the Q-matrices.')
			pong.colors = []
		
		# TO DO: if k_max < 26, option to use default colors

	fp_rel = path.split(filemap)[0] 

	n = set() # make sure all Q-matrices have the same number of individuals

	for q in qfiles_info:
		p = path.join(fp_rel, q[2])

		#read Q-matrix information into array
		try:
			data = np.genfromtxt(p,loose=False, unpack=True,delimiter=col_delim,
				autostrip=True,usecols=range(ignore_cols,ignore_cols+q[1]))
		except ValueError:
			sys.exit(error)

		K = len(data)
		if K==0:
			sys.exit('Error parsing Q-matrix data: check that the value of '
				'`--ignore_first_columns` matches the input data format.')
		if K != q[1]:
			sys.exit('Error parsing input files: encountered unexpected value '
				'of K.\nMake sure all input files have K greater than or equal to 2.')
		
		n.add(len(data[0]))

		name = q[0]
		if name.isdigit():
			sys.exit('Error: runID cannot only be an integer. '
				'It must be a string that contains at least one letter.')
		if '#' in name or '.' in name:
			sys.exit('Error: Invalid character encountered in runID. runIDs cannot '
				'contain \'#\' or \'.\' characters.')
		run = Run(K, name, data, p)
		pong.runs[run.id] = run

		if name in pong.name2id:
			sys.exit('Error parsing filemap: encountered duplicate Q-matrix ID %s.' % name)

		pong.name2id[name] = run.id

		pong.all_kgroups[K-pong.K_min].all_runs.append(run.id)

	if len(n) > 1:
		sys.exit('Error parsing input files: found Q-matrices with different '
			'numbers of individuals or populations.')


	pong.num_indiv = n.pop()


	if not ind2pop: return
	# ================= PARSE METADATA / POP INFO ========================
	'''
	ind2pop is either an int (i.e., which column of the Q-matrix has ind2pop data),
	or it's a 1-column file with num_indiv lines.

	labels specifies the L-to-R order for visualizing the populations. It can
	be provided in one of two formats:
	- just put each population on its own line in order
	- or it can be a 2-column, tab-delimited file which specifies both the 
	  L-to-R order and pop code to pop name. the code is usually a number (e.g.
	  for structure Q-files it's usually a number) but it could also be a shorter
	  name code (like CEU) that you want to expand for the final visualization.

	NOTE: ind2pop is allowed w/o labels; labels is not allowed w/o ind2pop.

	If no pop order is specified, we just use how it appears in the ind2pop file. 
	Also, consider that it may be faster if pop_order was a dictionary (mapping 
	popCode to index)? Only because list.index() is worst-case O(n) and dict.get() is O[1].
	'''

	# if ind2pop data is contained within the Q-matrices, parse it here. just
	# use the last Q-matrix that was parsed, it doesn't really matter which
	if type(ind2pop) == int:
		pong.ind2pop = np.genfromtxt(p, unpack=True, delimiter=col_delim,
			autostrip=True, usecols=(ind2pop-1,), dtype=str)
	else:
		pong.ind2pop = np.genfromtxt(ind2pop, unpack=True, autostrip=True, dtype=str)
		#check the length of ind2pop and then strip the unimportant features
	if len(pong.ind2pop) != pong.num_indiv:
		if len(pong.ind2pop) > 1:
			sys.exit('error: individual population file assignment contains more than 1 column of data')
		sys.exit('error - Inconsistent number of individuals found across dataset')
	
	if not labels_file:
		pops = set(pong.ind2pop)
		pong.pop_order = [x[1] for x in sorted([(np.where(ind2pop==p)[0], p) for p in pops])]
		pong.popcode2popname = {p:p for p in pops}
	
	else:
		labels = np.genfromtxt(labels_file, delimiter='\t', autostrip=True, 
			dtype=str, unpack=True)

		# if the labels file is 2-column, then create pop_order accordingly and populate the 
		# pop code to pop name dict with that info. Otherwise, pop code = pop name so just 
		# make the dict map each pop code/name to itself
		if len(labels.shape) == 2:
			if labels.shape[0] != 2:
				sys.exit('Error parsing labels file -- this should be a 2-column,'
					' tab-delimited file.')

			pong.pop_order = labels[0].tolist()
			pong.popcode2popname = dict(labels.transpose())
		else:
			if " " in labels[0]: #if there are spaces in the pop code -error
				sys.exit('invalid labels - make sure pop code and pop name are '
					' tab-delimited and pop code does not contain spaces.')
			pong.pop_order = labels.tolist()
			pong.popcode2popname = dict(zip(labels,labels)) # just map each pop to itself

		
		if set(pong.pop_order) != set(pong.ind2pop):
			# could be more descriptive here (e.g. print set differences)
			labels_only = set(pong.pop_order)-set(pong.ind2pop)
			ind2pop_only = set(pong.ind2pop)-set(pong.pop_order)
			s = 'Error: pop names in labels file are not the same as pop names in ind2pop file. '
			if len(labels_only) > 0:
				s += '\n\tMissing from ind2pop file: '+str(list(labels_only))
			if len(ind2pop_only) > 0:
				s += '\n\tMissing from labels file: '+str(list(ind2pop_only))
			sys.exit(s)

	
	pong.popindex2popname = {i:pong.popcode2popname[x] for i,x in enumerate(pong.pop_order)}

	# generate list of pop sizes
	pop_sizes_dict = defaultdict(int)
	for x in pong.ind2pop: pop_sizes_dict[x] += 1
	
	pong.pop_sizes = [0]*len(pong.pop_order)
	for pop_code,num_ind in pop_sizes_dict.items():
		pong.pop_sizes[pong.pop_order.index(pop_code)] = num_ind


	# what if we are given a file where pop-code is an int and pop-name is a str
	# and ind2pop is made with the popname (which is a valid 3 letter str that could
	# also be used as a pop-code) <- maybe we should allow the program to accept this.


def convert_data(pong):
	''' adds another format of run data (for use by D3)
	'''
	
	if pong.ind2pop is not None:
		order = [[] for i in xrange(len(pong.pop_order))]
		for i,p in enumerate(pong.ind2pop):
			order[pong.pop_order.index(p)].append(i)
	# else:
	# 	order = [[x for x in range(pong.num_indiv)]]
		for i,pop in enumerate(order):
			order[i] = sort_indiv(pong, pop)


		# total = [np.mean([sort_run.data[x]]) for x in range(sort_run.K)]
		# print(total)
		# maj_clust = total.index(max(total))
		# order.sort(key = lambda x: sort_run.data[maj_clust][x])

	clus_membership = {}
	for run in pong.runs.values():
		data = np.array([run.data[i] for i in run.alignment-1]).transpose()
		# print(run.alignment, run.rel_alignment)
		
		if pong.ind2pop is not None:
			

			#run.data_transpose_3d = []
			run.data_transpose_2d = []
			clus_membership[run.name] = []


			for p in order: 
				x = [data[i].tolist() for i in p]
				clus_membership[run.name].append([np.average([pop[r] for pop in x]) for r in range(run.K)])
				#run.data_transpose_3d.append(x)
				run.data_transpose_2d += x

		else:
			clus_membership[run.name] = [np.average([indiv[r] for indiv in data]) for r in range(run.K)]
			run.data_transpose_2d = data.tolist() #[x.tolist() for x in data.tolist()]
	pong.indiv_avg = clus_membership



	

def sort_indiv(pong, pop):
	sort_run = pong.runs[pong.sort_by]

	maj_clust = max(range(sort_run.K), key=lambda k: np.mean([sort_run.data[k][p] for p in pop]))
	pop.sort(key = lambda x: sort_run.data[maj_clust][x])
	return pop




# def convert_data(pong):
# 	''' adds another format of run data (for use by D3)
# 	'''
# 	if pong.ind2pop is not None:
# 		order = [[] for i in xrange(len(pong.pop_order))]
# 		for i,p in enumerate(pong.ind2pop):
# 			order[pong.pop_order.index(p)].append(i)

# 	for run in pong.runs.values():
# 		data = np.array([run.data[i] for i in run.alignment-1]).transpose()

# 		if pong.ind2pop is not None:
# 			run.data_transpose_3d = []
# 			run.data_transpose_2d = []
# 			for p in order: 
# 				x = [data[i].tolist() for i in p]
# 				run.data_transpose_3d.append(x)
# 				run.data_transpose_2d += x
			
# 		else:
# 			run.data_transpose_2d = data.tolist() #[x.tolist() for x in data.tolist()]

		































