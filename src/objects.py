'''
Includes: helper classes for pong

author: Aaron Behr
created: 2014-07-21
'''
import numpy as np

class Run:
	def __init__(self, K, rep_name, data, path):
		self.K = K
		self.name = rep_name
		self.data = data

		# both of these are transposed, colum-permuted versions of data.
		# if ind2pop exists, then they are also indivpop-sorted. 
		# however, if ind2pop does not, then they're not, and also 
		# data_transpose_3d is None.
		self.data_transpose_2d = None
		self.rel_gray = None
		#self.data_transpose_3d = None

		self.path = path
		self.id = str(id(self)) # convert to str so can hash

		self.sim_runs = [] # which other runs this run represents
		self.represented_by = self.id # at first, they all represent themselves.

		self.alignment = []
		self.rel_alignment = []

	def to_dict(self): return dict(self.__dict__) # copy a dict version



class Kgroup:
	''' stores information about all the (rep)
	runs at a certain value of K

	primary_run is the "major mode", i.e. the representative run which 
	represents the most other runs.

	alignment is the "best" alignment found for all the runs within this K.
	Note that although this alignment is only comparing runs at this value of K,
	the permutation of the alignment itself is relative to the 1st run of the 
	lowest K, i.e. the first perm of alignment is only necessarily in-order if 
	we're at K=k_min.

	rel_alignment is also the "best" alignment found, but this alignment is
	permuted relative to the 1st run at this value of K, i.e. the first perm of 
	rel_alignment is necessarily in-order.

	alignment_across_K is the "best" alignment relative to the 1st run of
	the smallest K. It's also expanded to be the length of the largest K
	(with duplicate elements in all cases except @ the largest K)

	distruct_perm is the order of colors, aligned to alignment_across_K,
	except that its length is K, i.e. it does not have duplicate elements in
	order to be the length of the largest value of K
	'''
	def __init__(self, K):
		self.K = K
		self.all_runs = [] # all runs at this value of K
		self.rep_runs = [] # just the representative runs
		self.primary_run = '' 
		self.alignment = []
		self.rel_alignment = []
		self.alignment_across_K = []


		# NOTE: color_perm and distruct_perm are similar; color_perm uses a color index
		# and distruct_perm uses actual color names. distruct_perm is for printing Distruct
		# perm files and will be deprecated soon. color_perm will be used in D3.
		# Keeping distruct_perm for now for backwards compatibility
		self.distruct_perm = []
		self.color_perm = []

		self.avg_runs = [] # avg runs for a mode




class Match:
	'''
	pong.cluster_matches[run1][run2] = Match object
	'''

	def __init__(self):
		self.sim = -1
		# self.dif = -1
		self.edges = {} # self.edges[(fromnode,tonode)] = score
		self.from_nodes = set()
		self.to_nodes = set()
		self.perm = []


	def print_best_cluster_matches(self, from_cluster, num=None):
		l = [(self.edges[e], e[1]) for e in (x for x in self.edges.keys() if x[0]==from_cluster)]
		l.sort(reverse=True)
		if num is not None:
			return l[:num]
		else:
			return l

