import sys
import numpy as np
from itertools import product
from munkres import Munkres # this needs to be pip installed

m = Munkres()

def compute_alignments(pong, worst_choice,sim_thresh):
	runs, all_kgroups = pong.runs, pong.all_kgroups
	'''
	Alignment of runs within each K is relative to the perm in the alignment
	across K, rather than being relative to the primary run in that K

	If there is only 1 value of K, alignment and rel_alignment are the same.

	Also reset primary run for each kgroup s.t. it is the "major mode", rather
	than just being the 1st run.
	'''
	# ALIGN RUNS ACROSS K
	if len(all_kgroups)>1:
		aligned_perms = align_perms_across_K(pong, worst_choice)
		for alignment,kgroup in zip(aligned_perms, all_kgroups):
			kgroup.alignment_across_K = alignment
			if not valid_perm(condense_perm(alignment)):
				error = '\n\nWARNING: could not align perms across K. '
				error += 'May not be possible to obtain good results.\n'
				print error


	# ALIGN RUNS WITHIN EACH K
	for kgroup in all_kgroups:
		primary_alignment = [x+1 for x in range(kgroup.K)]
		aligned_perms = [primary_alignment]
		runs[kgroup.primary_run].rel_alignment = primary_alignment
		# print("test: ", kgroup.primary_run, runs[kgroup.primary_run].rel_alignment)

		for run in [x for x in kgroup.all_runs if x != kgroup.primary_run]:
			na, best_perm = get_best_perm(pong, kgroup.primary_run, 
				run, worst_choice,sim_thresh)
			# best_perm = pong.cluster_matches[kgroup.primary_run][run].perm
			aligned_perms.append(best_perm)
			runs[run].rel_alignment = best_perm
		
		kgroup.rel_alignment = np.array(aligned_perms)

		# PERMUTE THE ALIGNMENT
		if len(all_kgroups)>1:
			abs_alignment = condense_perm(kgroup.alignment_across_K)
			rel_transp = kgroup.rel_alignment.transpose()
			abs_transp = [rel_transp[i-1] for i in abs_alignment]
			kgroup.alignment = np.array(abs_transp).transpose()
		else:
			kgroup.alignment = kgroup.rel_alignment

		# RECORD EACH RUN'S ALIGNMENT
		for i,run in enumerate(kgroup.all_runs):
			runs[run].alignment = kgroup.alignment[i]
			# print("rel gray", kgroup.K, runs[run].rel_gray)
			if runs[run].rel_gray:
				runs[run].rel_gray = [kgroup.alignment[i].tolist().index(x) for x in runs[run].rel_gray]
			# print("permuted gray", runs[run].rel_gray, "alignment", runs[run].name, kgroup.alignment[i])
			# print("run's alignment: ", run, kgroup.alignment[i])


def find_permutation(mat,column_labels,within=False,sim_thresh=0):
	indexes = m.compute(mat)
	total = 0.0
	for row,column in indexes:
		value = 1-mat[row][column]
		total += value
		#print("(%d,%d) : %.4f" % (row,column,value))
	average = total/len(indexes)
	# print("total: %.4f , average: %.4f" %(total,average))
	p = [column_labels[x[1]] for x in indexes]
	perm1,perm2 = simplify_perm(p)

	# for graying out
	if within:
		gray = {column_labels[indexes[x][1]] for x in range(len(indexes)) if (1-mat[indexes[x][0]][indexes[x][1]]) > sim_thresh}

		return perm1,perm2,average,gray

	
	return perm1,perm2,average


def get_best_perm(pong, run1, run2, worst_choice=2, sim_thresh=.97):
	runs = pong.runs
	cluster_matches = pong.cluster_matches
	''' get best perm aligning run2 with run1.
	idk, should we calculate it from scratch if we don't have it?
	prob not. maybe it should just error if it's not already in
	the dictionary but idk.

	if run2.K = run1.K+1, run1 perm is expanded to the size of run2

	e.g.
	input = [1 2 3], [2/4 1 3]
	output = [1 1 2 3], [2 4 1 3]

	We won't look past the worst_choice'th choice for matching
	'''
	match = cluster_matches[run1][run2]

	if runs[run2].K == runs[run1].K+1:
		run2_tuples = [y for y in match.to_nodes if len(y)==2]
		average = 0
		tmp_tuple = (0,0)
		for t0,t1 in run2_tuples:
			labels = [(x,) for x in range(1,runs[run2].K+1) if x != t0 and x != t1] + [(t0,t1)]
			mat = [[1-match.edges[(y+1,x)] for x in labels] for y in range(len(labels))]

			tmp_p1,tmp_p2,tmp_average = find_permutation(mat,labels)
			if tmp_average > average:
				p1,p2,average = tmp_p1,tmp_p2,tmp_average 
	else:
		labels = sorted(match.to_nodes)
		mat = [[1-match.edges[(y+1,x)] for x in labels] for y in range(len(labels))]

		p1,p2,average,gray = find_permutation(mat,labels,within=True,sim_thresh=sim_thresh)
		if runs[run2].represented_by == run2:
			runs[run2].rel_gray = simplify_perm(gray)[1]

	if valid_perm(p2):
		# Commented out the extra terminal output associated with the older -v option
		# s = '%s, ' % (runs[run2].name)
		# s += 'found valid perm %s with similarity %s ' % (p2, average)
		# if pong.print_all: print s
		return p1, p2

	print '%s, could not find good match valid perm' % runs[run2].name

	# return 1st choice perm if valid or if we couldn't find any valid perm
	return p1,p2


def align_perms_across_K(pong, worst_choice):
	all_kgroups = pong.all_kgroups
	'''
	here I have to assume that we're getting matched solutions across K where
	one perm (smaller K) has exactly 1 cluster repeated twice, which is the
	merged cluster of the larger K. This isn't always the case with real data,
	but it is a necessary asssumption to make in order to align validly.
	'''

	# GENERATE ALL PERMS
	all_perms = []
	for kgroup1,kgroup2 in zip(all_kgroups[:-1],all_kgroups[1:]):
		perm1, perm2 = get_best_perm(pong, kgroup1.primary_run, 
			kgroup2.primary_run, worst_choice)
		all_perms.append([perm1,perm2])

	#print all_perms

	# RESIZE ALL PERMS s.t. they all have length K_max
	# this code sux
	aligned_perms = [all_perms[0][0], all_perms[0][1]]
	for i in range(1, len(all_perms)):
		
		# first find the cluster number in this value of K that splits
		# when we go to the next value of K
		l = all_perms[i][0]
		val = -1
		for j in range(len(l)-1):
			if l[j] == l[j+1]: val = l[j]

		# then, find the index that corresponds with this value in the 
		# aligned perms and duplicate the value at that index for each
		# of the perms in it.
		# TODO: maybe use the code from simplify_perm
		index = aligned_perms[-1].index(val)

		for j,perm in enumerate(aligned_perms):
			aligned_perms[j].insert(index, perm[index])


		# finally, permute the perm2 at the next value of K to be aligned
		# with the perm at the previous value of K that's in aligned_perms
		permuted_perm = []

		p1 = list(all_perms[i][0])
		p2 = list(all_perms[i][1])

		for x in aligned_perms[-1]:
			index = p1.index(x)
			permuted_perm.append(p2[index])
			
			# remove both so that the index() function will find other
			# instances of the value, if there are any.
			p1.pop(index) 
			p2.pop(index)

		aligned_perms.append(permuted_perm)

	return aligned_perms


def condense_perm(p, p2=None):
	'''
	takes a perm that has been expanded to align with a larger perm
	(i.e. contains duplicates), and condenses it so that there is
	only one of each cluster, but maintains the order.

	e.g.
	input: 2 2 2 3 1 1
	output: 2 3 1


	If the 2nd argument is used, then instead p is condensed and p2 is 
	condensed only until the size of p
	e.g.
	input: p=[1 1 1 2 3 3], p2=[1 1 1 1 2 2]
	output: p=[1 2 3], p2=[1 1 2]
	'''
	r = list(p)
	if p2: r2 = list(p2)

	if len(r)==1: return r

	i = 0
	while i < len(r)-1:
		if r[i] == r[i+1]:
			r.pop(i+1)
			if p2: r2.pop(i+1)

		else:
			i += 1

	if p2: return r,r2
	return r


def valid_perm(p):
	'''
	Returns true if the input perm is a 'valid' perm, i.e. is equivalent
	to range(1,something)
	'''
	psort = list(p)
	psort.sort()
	
	for i,e in enumerate(psort):
		if e != i+1: return False

	return True


def simplify_perm(p):
	'''
	Takes in a perm that has (a) duple(s) and simplifies it to a regular
	perm. Also generates an in-order perm at the previous K with (a) duplicate
	element(s) (i.e. the index(es) that the previous duples were at).

	Also because all elements are tuples, simplifies them to ints

	e.g.
	input = [(2,), (4,), (1,3), (5,)]
	output = [1,2,3,3,4], [2,4,1,3,5]
	'''
	merged = [i for i,x in enumerate(p) if len(x)==2]
	# if len(merged)==0 or len(merged)>1: return None

	perm1 = []
	perm2 = []

	for i,x in enumerate(p):
		perm1 += ( [i+1, i+1] if i in merged else [i+1] )
		perm2 += ( [x[0], x[1]] if i in merged else [x[0]] )

	return perm1, perm2
