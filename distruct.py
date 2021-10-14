'''
Includes:
generate_distruct_perm_files(pong, color_file)
find_splitting_clusters(permk, permkp1)
find_duplicate_element(perm)
print_distruct_perm_files(pong)

'''
import os
import sys
from os import path
import numpy as np
from align import condense_perm, valid_perm



def generate_distruct_perm_files(pong, colors):
	runs, all_kgroups = pong.runs, pong.all_kgroups
	'''
	if print_all is selected, makes perm files for all runs, not just rep runs.
	Note that we can only make a distruct perm file if a valid perm was
	found for that run. Otherwise it won't work, and we don't make one.

	the colors are assigned to clusters in the order that they appear in the 
	color file. Also, when a cluster splits and a new color is needed for the
	next value of K, the cluster which has a higher overall membership in the
	primary run keeps the old color.
	'''

	if len(colors) < all_kgroups[-1].K:
		sys.exit('Error parsing distruct colors file: must have at least %d '
			'colors.' % all_kgroups[-1].K)


	# EDGE CASE OF LOWEST VALUE OF K, for which we don't need to think about the
	# color assignment 
	kgroup = all_kgroups[0]
	kgroup.distruct_perm = colors[:kgroup.K]

	for k in range(1, len(all_kgroups)):
		kgroup = all_kgroups[k]

		# figure out which cluster splits in the prev K and which two
		# clusters @ this K came from it
		_, child_clusters = find_splitting_clusters(
			all_kgroups[k-1].alignment_across_K, kgroup.alignment_across_K)

		# figure out which of the resulting chidlren @ this K has more memb
		perm = condense_perm(kgroup.alignment_across_K)
		memb1 = np.sum(runs[kgroup.primary_run].data[child_clusters[0]-1])
		memb2 = np.sum(runs[kgroup.primary_run].data[child_clusters[1]-1])

		# initialize the perm to be a copy of the prev K's perm. note that the
		# perm list is too short until we insert the new color
		kgroup.distruct_perm = list(all_kgroups[k-1].distruct_perm)
		
		# insert the new color at the index of the child cluster with the 
		# smaller memb, s.t. the other child cluster keeps the parent color
		new_color = colors[kgroup.K-1]
		new_index = perm.index(child_clusters[(0 if memb1 < memb2 else 1)])
		kgroup.distruct_perm.insert(new_index, new_color)

	
	print_distruct_perm_files(pong)



def generate_color_perms(pong):
	'''
	adapted from generate_distruct_perm_files
	'''
	# EDGE CASE OF LOWEST VALUE OF K, for which we don't need to think about the
	# color assignment 
	kgroup = pong.all_kgroups[0]
	kgroup.color_perm = list(range(kgroup.K))

	for k in range(1, len(pong.all_kgroups)):
		kgroup = pong.all_kgroups[k]

		# figure out which cluster splits in the prev K and which two
		# clusters @ this K came from it
		_, child_clusters = find_splitting_clusters(
			pong.all_kgroups[k-1].alignment_across_K, kgroup.alignment_across_K)

		# figure out which of the resulting chidlren @ this K has more memb
		perm = condense_perm(kgroup.alignment_across_K)
		memb1 = np.sum(pong.runs[kgroup.primary_run].data[child_clusters[0]-1])
		memb2 = np.sum(pong.runs[kgroup.primary_run].data[child_clusters[1]-1])

		# initialize the perm to be a copy of the prev K's perm. note that the
		# perm list is too short until we insert the new color
		kgroup.color_perm = list(pong.all_kgroups[k-1].color_perm)
		
		# insert the new color at the index of the child cluster with the 
		# smaller memb, s.t. the other child cluster keeps the parent color
		new_color = kgroup.K-1
		new_index = perm.index(child_clusters[(0 if memb1 < memb2 else 1)])
		kgroup.color_perm.insert(new_index, new_color)







def find_splitting_clusters(permk, permkp1):
	'''
	takes in a perm at k and a perm at k+1 and returns the cluster num at K
	which splits into two, and a tuple containing the cluster nums of the two
	child clusters at k+1
	'''
	# find which cluster in the perm at k is the one that splits
	tmp_permkp1, tmp_permk = condense_perm(permkp1, permk)
	cluster_which_splits = find_duplicate_element(tmp_permk)
	
	# find the indices containing cluster_which_splits
	indices = [i for i, x in enumerate(tmp_permk) if x == cluster_which_splits]
	
	# may not want to include this error checking
	try:
		assert (len(indices) == 2) #there should be exactly 2 bc it's splitting into 2
		assert (indices[1] == indices[0]+1) #the 2nd one should come right after the 1st
	except AssertionError:
  		print('An error occurred on line {} in an assertion statement. Please report this' 
  			' problem by contacting the pong team.'.format(sys.exc_info().tb_lineno))
  		exit(1)


	# find the cluster nums at k+1 corresponding to these indices
	child_clusters = [tmp_permkp1[i] for i in indices]

	return cluster_which_splits, child_clusters



def find_duplicate_element(perm):
	p = list(perm)
	
	for x in list(set(p)):
		p.remove(x)

	# may not want/need to include this error checking
	if len(p)>1:
		sys.exit('ERROR: there should only be one duplicate element')

	return p[0]






def print_distruct_perm_files(pong):
	permfiles_dir = path.join(pong.output_dir, 'distruct_perm_files')
	os.makedirs(permfiles_dir)

	for kgroup in pong.all_kgroups:
		colors = kgroup.distruct_perm

		for run in (kgroup.all_runs if pong.print_all else kgroup.rep_runs):
			if valid_perm(pong.runs[run].alignment):
				rep = '_reprun' if run in kgroup.rep_runs else ''
				x = (pong.runs[run].name, rep)
				name = 'distruct_perm_file_%s%s.txt' % x
				
				with open(path.join(permfiles_dir, name), 'w') as f:
					for cluster, color in zip(pong.runs[run].alignment, colors):
						f.write( '%d %s\n' % (cluster, color) )





