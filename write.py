import os
from os import path
import numpy as np
import shutil #best way to copy a file?
import json

def output_cluster_match_details(pong):
	runs = pong.runs
	all_kgroups = pong.all_kgroups
	cluster_matches = pong.cluster_matches
	output_dir = pong.output_dir

	'''
	Outputs a file detailing cluster matching info for each pair of runs that 
	were compared. If print_all, show ALL cluster comparison scores rather than 
	just the best 4 matches for each cluster.

	Also outputs a summary file which has the primary and representative runs
	and which runs they represent for each K.
	'''
	if pong.print_all:
		result_fp = path.join(output_dir, 'cluster_matching_results')
		os.makedirs(result_fp)

		# OUTPUT DETAILS FOR EACH PAIR OF RUNS
		for run1 in cluster_matches:
			r1 = runs[run1]
			for run2 in cluster_matches[run1]:
				r2 = runs[run2]		
				match = cluster_matches[run1][run2]

				data = (r1.name, r2.name)
				fname = 'result_%s_%s.txt' % data
				f = open(path.join(result_fp, fname), 'w')

				header = 'Comparing %s with %s.\n' % data
				header += 'Avg. similarity = %f\n' % (match.sim)
				# header += 'Avg. similarity = %f, avg. difference = %f.\n\n' % (match.sim,match.dif)
				f.write(header)

				for i in match.from_nodes:
					f.write('\ncluster %d:\n' % (i))

					# User could be able to choose the number of best matches to output, otherwise print all
					for e in (match.print_best_cluster_matches(i) if pong.print_all else match.print_best_cluster_matches(i, 5)):
						f.write('\t%s: %f\n' % (str(e[1]), e[0]))

				f.close()


	# OUTPUT SUMMARY FILE
	f = open(path.join(output_dir, 'result_summary.txt'), 'w')
	
	header = pong.intro+'\n\n'
	header += 'Results summary\n'
	header += '===============\n\n'
	f.write(header)

	for kgroup in all_kgroups:
		f.write('____________________________________________K=%d\n' % kgroup.K)
		info = 'Number of runs: %d\n' % len(kgroup.all_runs)

		x = [len(runs[run].sim_runs) for run in kgroup.rep_runs]
		maj = runs[kgroup.rep_runs[np.argmax(x)]].name
		info += 'Major mode: %s\n\n' % maj

		rep_runs = [runs[x].name for x in kgroup.rep_runs]
		info += 'Representative runs: '+', '.join(rep_runs)

		#avg_sim_within = []
		avg_sim_btwn = []

		for run in kgroup.rep_runs:
			r = runs[run].name
			sim_runs = [r]+[runs[x].name for x in runs[run].sim_runs]

			pl = 's' if len(sim_runs)>1 else ''
			data = (r, len(sim_runs), pl, pl)
			info += '\n\t%s represents %d run%s: run%s ' % data
			info += ', '.join(sim_runs)

			if len(runs[run].sim_runs)>0:

				# sim_within uses the similarity within the "best" perm (even if it's not valid) for each cluster
				# and then averages -> consider revising and printing after the best perm has been found
				sim_within = []
				sim_runs_id = sorted([run] + runs[run].sim_runs)
				for x in sim_runs_id:
					for y in sim_runs_id[sim_runs_id.index(x)+1:]:
						sim_within.append(cluster_matches[x][y].sim)
				sim_within = np.average(sim_within)
				#avg_sim_within.append(sim_within)
				info += '. Avg sim within = %f' % sim_within

		if len(kgroup.rep_runs)>1:
			rep_runs = sorted(kgroup.rep_runs)
			for run1 in rep_runs:
				for run2 in rep_runs[rep_runs.index(run1)+1:]:
					avg_sim_btwn.append(cluster_matches[run1][run2].sim)
			
			#info += '\nAvg sim within modes = %f' % np.average(avg_sim_within)
			info += '\nAvg sim between modes = %f' % np.average(avg_sim_btwn)

		f.write(info+'\n\n')

	f.close()




def output_alignments(pong):
	runs, all_kgroups, output_dir = pong.runs, pong.all_kgroups, pong.output_dir
	'''
	Output representative run Q matrices. 

	Creates files with the "best" alignment of clusters for each run,
	both within and across K.

	Across K, the 1st run for each K is aligned back to the run with the 
	lowest value of K. This is not a very useful file for the user to look at.

	Within K, the runs are outputted in their input order and aligned to
	the first run, for each K.
	'''

	# This is the directory for original runs (specified as the repruns)
	# if we want to output the representative runs, we read and copy the file
	# this might be unnecessary - we could read the original without copying
	# and create a txt file with names or paths of repruns?
	run_fp = path.join(output_dir, 'runs')
	os.makedirs(run_fp)


	# OUTPUT REPRESENTATIVE RUNS - get rid of this? printing originial matricies is unnecessary because 
	# we can still access this data
	
	for kgroup in all_kgroups:
		for run in (kgroup.all_runs if pong.print_all else kgroup.rep_runs):
			# TODO: would it be better to call this a mode rather than rep run?
			rep = '_reprun' if run in kgroup.rep_runs else ''
			fname = '%s%s.Q' % (runs[run].name, rep)
			shutil.copy(runs[run].path, path.join(run_fp, fname))


	
	# OUTPUT BEST ALIGNMENT ACROSS K
	if len(all_kgroups)>1:
		f = open(path.join(output_dir, 'best_alignment_across_K.txt'), 'w')

		header = pong.intro+'\n\n'
		header += 'Alignment of best permutation of all runs across K\n'
		header += 'This is just the alignment of the major mode rep run for each K\n'
		header += '================================================================\n'
		f.write(header)

		for kgroup in all_kgroups:
			f.write('\n' + runs[kgroup.primary_run].name + '\t' + '\t'.join([str(x) for x in kgroup.alignment_across_K]))

		f.close()


	# OUTPUT CLUMPP-LIKE RESULT, BEST ALIGNMENT WITHIN EACH K
	f = open(path.join(output_dir, 'best_alignment_per_K.txt'), 'w')

	header = pong.intro+'\n\n'
	header += 'Alignment of best permutation of all runs for each (fixed) K\n'
	header += 'Runs are in order (according to input file); one run per row.\n'
	header += '=============================================================\n'
	f.write(header)

	for kgroup in all_kgroups:
		f.write('\n\n______________________________________ K=%d\n' % kgroup.K)

		#TODO: if you want abs alignment too/instead, just switch
		# rel_alignment to alignment. 
		for i, perm in enumerate(kgroup.rel_alignment):
			s = runs[kgroup.all_runs[i]].name
			f.write('\n' + s + '\t' +'\t'.join([str(x) for x in perm]) ) 
			if kgroup.all_runs[i] in kgroup.rep_runs: f.write('\t*')

	f.close()
	


def write_json(pong, as_file=False):
	runs = pong.runs
	all_kgroups = pong.all_kgroups
	cluster_matches = pong.cluster_matches
	output_dir = pong.output_dir

	data = {}
	
	#error when pop_order and popcode2popname/ind2pop is None
	# if pong.ind2pop is not None:
	# 	data["indivPops"] = pong.ind2pop.tolist()
	# 	if pong.pop_order is not None:
	# 		data["popOrder"] = pong.pop_order
	# 	else:
	# 		pop_order = list(set(pong.ind2pop))
	# 		data["popOrder"] = pop_order
	# if pong.popcode2popname:
	# 	data["popnum2popname"] = pong.popcode2popname


	''' new thing is where we just have a dictionary mapping pop order to pop name '''
	if pong.ind2pop is not None:
		data["popNames"] = pong.popindex2popname
		data["popSizes"] = pong.pop_sizes

	data["K_min"] = int(pong.K_min)
	data["K_max"] = int(pong.K_max)
	data["colors"] = pong.colors
	data["sim_threshold"] = pong.sim_threshold

	data["qmatrices"] = []
	for kgroup in all_kgroups:
		info = {}
		info["K"] = int(kgroup.K)
		info["total_runs"] = len(kgroup.all_runs)

		info["major_mode_runid"] = runs[kgroup.primary_run].name
		info["color_perm"] = [int(x) for x in kgroup.color_perm]
		# rep_runs = [runs[x].name for x in kgroup.rep_runs]
		# info += 'Representative runs: '+', '.join(rep_runs)

		if len(kgroup.rep_runs)>1:
			avg_sim_btwn = []
			rep_runs = sorted(kgroup.rep_runs)
			for run1 in rep_runs:
				for run2 in rep_runs[rep_runs.index(run1)+1:]:
					avg_sim_btwn.append(cluster_matches[run1][run2].sim)
			info["avg_sim_bt_modes"] = np.average(avg_sim_btwn)
		
		mode_dict = {}
		for run in kgroup.rep_runs:
			
			r = runs[run]
			sim_runs = [r.name] + [runs[x].name for x in runs[run].sim_runs]
			mode_dict[r.name] = {}
			mode_dict[r.name]["filepath"] = r.path
			mode_dict[r.name]["column_perm"] = r.alignment.tolist()
			mode_dict[r.name]["runs_represented"] = sim_runs
			sim_within = []
			if len(runs[run].sim_runs)>0:
				sim_runs_id = sorted([run] + runs[run].sim_runs)
				for x in sim_runs_id:
					for y in sim_runs_id[sim_runs_id.index(x)+1:]:
						sim_within.append(cluster_matches[x][y].sim)
			if sim_within:
				sim_within = np.average(sim_within)
				mode_dict[r.name]["avg_sim"] = sim_within
			if run != kgroup.primary_run:
				mode_dict[r.name]["gray_indices"] = r.rel_gray

		info["modes"] = mode_dict
		data["qmatrices"].append(info)

	data["sort_by"] = runs[kgroup.primary_run].name # K_max major mode rep run
	data["indiv_avg"] = pong.indiv_avg
	
	if not as_file:
		return data

	else:
		with open(path.join(output_dir, 'data.json'), 'w') as f:
			f.write(json.dumps(data))
		return data #add 'return data' here if json should be written out; see also ../run_pong.py





