#!/usr/bin/env python

'''
author: Aaron Behr
created: 2014-06-29
'''
import sys
import numpy as np
import os
from os import path
import argparse
import time
import json
from shutil import rmtree
import tornado.ioloop
import tornado.web
import tornado.websocket

sys.path.insert(0, path.join(path.dirname(__file__),'src'))
import parse, cm, write, align, distruct



clients = []
threads = []
pongdata = None
run_pong_args = None

class Pongdata:
	def __init__(self, intro, outputdir, printall):
		self.runs = {} # contains all Run objects
		self.all_kgroups = [] # contains kgroups in order
		self.cluster_matches = {} # all clustering solutions matching 2 runs

		self.name2id = {} # run name to run ID


		self.num_indiv = -1
		self.K_min = -1
		self.K_max = -1

		self.intro = intro
		self.output_dir = outputdir
		self.print_all = printall

		self.ind2pop = None
		self.pop_order = None
		self.popcode2popname = None
		self.popindex2popname = None
		self.pop_sizes = None
		self.sort_by = None
		self.indiv_avg = None

		self.colors = [] # use custom colors?

		# status attr is only necessary if pong is run from within the server
		# self.status = 0 # incomplete, working, or complete (0,1,2)

version = 'DEV'

intro = '\n'
intro += '-------------------------------------------------------------------\n'
intro += '                            p o n g\n'
intro += '      by A. Behr, K. Liu, G. Liu-Fang, and S. Ramachandran\n'
intro += '                       Version %s (2016)\n' % version
intro += '-------------------------------------------------------------------\n'
intro += '-------------------------------------------------------------------\n'






def main():
	dist_metrics = ['sum_squared', 'percent', 'G', 'jaccard']
	
	parser = argparse.ArgumentParser(description='-------------------------------- '
		'pong, v%s --------------------------------' % version)

	parser.add_argument('-m', '--filemap', required=True,
		help='path to params file containing information about input '
		'Q-matrix files')
	parser.add_argument('-c', '--ignore_cols', type=int, default = 0,
		help='ignore the first i columns of every data line. Typically 5 for '
		'Structure output and 0 for ADMIXTURE output. Default = 0')
	parser.add_argument('-o', '--output_dir', default=None, # gets set later
		help='specify output dir for files to be '
		'written to. By default, pong makes a folder named "pong_output_datetime" in '
		'the current working directory, where "datetime" is the current system date and time.')

	parser.add_argument('-i','--ind2pop', default=None,
		help='ind2pop data (can be either a Q-matrix column number or the ' 
		'path to a file containing the data).')
	parser.add_argument('-n', '--pop_names', default=None,
		help='Path to file containing population order/names.')
	parser.add_argument('-l','--color_list',
		help='List of colors to be used for visualization. If this file is not '
		'included, then default colors will be used for visualization.')

	parser.add_argument('-f', '--force', default=False,
		action='store_true', help='force overwrite already existing output '
		'directory. By default, pong will prompt the user before overwriting.')

	parser.add_argument('-s', '--sim_threshold', type=float,
		default=0.97, help='choose threshold to combine redundant clusters at '
		'a given K. Default = 0.97')
	parser.add_argument('--col_delim', default=None,
		help='Provide the character on which to split columns. Default is '
		'whitespace (of any length).')
	parser.add_argument('--dist_metric',
		default='jaccard', help='distance metric to be used for comparing '
		'cluster similarities. Choose from %s. Default = jaccard' 
		% str(dist_metrics))
	parser.add_argument('--disable_server', default=False, action='store_true',
		help='run pong\'s algorithm without initializing a server instance or '
		'visualizing results.')
	parser.add_argument('-p','--port', type=int, default=4000,
		help='Specify port on which the server should locally host. Default = 4000.')
	parser.add_argument('-v', '--verbose', default=False,
		action='store_true', help='Report more details about clustering '
		'results to the command line, and print all cluster distances in the '
		'output files (by default, only the best 5 are printed).')

	parser.add_argument('-g', '--greedy', default=False, action='store_true',
		help='Force the use of the greedy algorithm if a set of disjoint '
		'cliques cannot be found. By default, pong prompts the user with a '
		'choice of whether to continue with the greedy algorithm, or to '
		'exit and re-run with different parameters.')

	opts = parser.parse_args()

	# Check system Python version
	if sys.version_info.major != 2:
		sys.exit('Error: You are running Python %d; pong requires version 2.' % sys.version_info.major)
	if sys.version_info.minor != 7:
		sys.exit('Error: You are running Python 2.%d; pong requires version 2.7.' % sys.version_info.minor)
	if sys.version_info.micro < 8:
		sys.stdout.write('Warning: you are running an older version of Python (v2.7.%d). '
			'We recommend upgrading to a newer version of Python 2 (version 2.7.8 or later), '
			'otherwise you may experience issues running pong.\n'  % sys.version_info.micro)
		r = raw_input('Continue anyway? (y/n): ')
		while r not in ('y','Y','n','N'):
			r = raw_input('Please enter "y" to overwrite or "n" to exit: ')
		if r in ('n','N'): sys.exit(1)



	# Check validity of pongparams file
	pong_filemap = path.abspath(opts.filemap)
	if not path.isfile(pong_filemap):
		sys.exit('Error: Could not find pong filemap at %s.' % pong_filemap)

	# Check validity of specified distance metric
	if not opts.dist_metric in dist_metrics:
		x = (opts.dist_metric, str(dist_metrics))
		sys.exit('Invalid distance metric: "%s". Please choose from %s' % x)

	printall = opts.verbose
	
	ind2pop = None
	labels = None

	if opts.ind2pop is not None:
		try:
			ind2pop = int(opts.ind2pop)
		except ValueError:
			ind2pop = path.abspath(opts.ind2pop)
			if not path.isfile(ind2pop):
				sys.exit('Error: Could not find ind2pop file at %s.' % ind2pop)
	

	if opts.pop_names is not None:
		if ind2pop is None:
			sys.exit('Error: must provide ind to pop data in order to provide '
				'pop order data')
		labels = path.abspath(opts.pop_names)
		if not path.isfile(labels):
			sys.exit('Error: Could not find pop order file at %s.' % labels)




	# Check validity of color file
	colors = []
	color_file = opts.color_list
	if color_file:
		color_file = path.abspath(color_file)
		if not path.isfile(color_file):
			sys.stdout.write('\nWarning: Could not find color file '
				'at %s.\n' % color_file)
			
			r = raw_input('Continue using default colors? (y/n): ')
			while r not in ('y','Y','n','N'):
				r = raw_input('Please enter "y" to overwrite or '
					'"n" to exit: ')
			if r in ('n','N'): sys.exit(1)

			color_file = None
		else:
			sys.stdout.write('\nCustom colors provided. Visualization utilizes the '
				'color white.\nIf color file contains white, users are advised to '
				'replace it with another color.\n')
			with open(color_file,'r') as f:
				colors = [x for x in [l.strip() for l in f] if x != '']


	# Check and clean output dir
	outputdir = opts.output_dir
	if outputdir:
		outputdir = path.abspath(outputdir)
	else:
		dirname = 'pong_output_' + time.strftime('%Y-%m-%d_%Hh%Mm%Ss')
		outputdir = path.abspath(path.join(os.getcwd(), dirname))
	
	if os.path.isdir(outputdir):
		if opts.force:
			rmtree(outputdir)
		else:
			outputdir_name = os.path.split(outputdir)[1]
			print '\nOutput dir %s already exists.' % outputdir_name

			r = raw_input('Overwrite? (y/n): ')
			while r not in ('y','Y','n','N'):
				r = raw_input('Please enter "y" to overwrite or "n" to exit: ')
			if r in ('n','N'): sys.exit(1)
			rmtree(outputdir)

	os.makedirs(outputdir)


	# Initialize object to hold references to all main pong data
	global pongdata
	pongdata = Pongdata(intro, outputdir, printall)
	pongdata.colors = colors


	params_used = intro+'\n\n' # ===============\n
	params_used += 'pong_filemap file: %s\n' % pong_filemap
	params_used += 'Distance metric: %s\n' % opts.dist_metric
	params_used += 'Similarity threshold: %f\n' % opts.sim_threshold
	params_used += 'Verbose: %s\n' % str(pongdata.print_all)
	params_used += '\nFull command: ' + ' '.join(sys.argv[:]) + '\n'

	with open(os.path.join(pongdata.output_dir,'params_used.txt'),'w') as f:
		f.write(params_used)


	global run_pong_args
	run_pong_args = (pongdata, opts, pong_filemap, labels, ind2pop)


	# ========================= RUN PONG ======================================

	print pongdata.intro


	# Code for running pong from the tornado app
	# if opts.disable_server:
	# 	run_pong(*run_pong_args)
	# else:
	# 	app = Application()
	# 	app.listen(opts.port)

	# 	msg = 'pong server is now running locally & listening on port %s\n' % opts.port
	# 	msg += 'Open your web browser and navigate to localhost:%s to see the visualization\n\n'% opts.port
	# 	sys.stdout.write(msg)
		
	# 	try:
	# 		tornado.ioloop.IOLoop.current().start()
	# 	except KeyboardInterrupt:
	# 		sys.stdout.write('\n')
	# 		sys.exit(0)


	run_pong(*run_pong_args)



	if not opts.disable_server:
		app = Application()
		app.listen(opts.port)
		msg = '-----------------------------------------------------------\n'
		msg += 'pong server is now running locally & listening on port %s\n' % opts.port
		msg += 'Open your web browser and navigate to http://localhost:%s to see the visualization\n\n'% opts.port
		sys.stdout.write(msg)
		
		try:
			tornado.ioloop.IOLoop.current().start()
		except KeyboardInterrupt:
			sys.stdout.write('\n')
			sys.exit(0)





def run_pong(pongdata, opts, pong_filemap, labels, ind2pop):
	pongdata.status = 1

	t0=time.time()
	# PARSE INPUT FILE AND ORGANIZE DATA INTO GROUPS OF RUNS PER K
	print 'Parsing input and generating cluster network graph'
	parse.parse_multicluster_input(pongdata, pong_filemap, opts.ignore_cols, 
		opts.col_delim, labels, ind2pop)


	# MATCH CLUSTERS FOR RUNS WITHIN EACH K AND CONDENSE TO REPRESENTATIVE RUNS
	print 'Matching clusters within each K and finding representative runs'
	t1 = time.time()
	cm.clump(pongdata, opts.dist_metric, opts.sim_threshold, opts.greedy)

	# MATCH CLUSTERS ACROSS K
	print 'Matching clusters across K'
	cm.multicluster_match(pongdata, opts.dist_metric)
	t2 = time.time()

	# PRINT MATCH CLUSTERS RESULTS
	write.output_cluster_match_details(pongdata)
	
	# print(pongdata.name2id)
	# COMPUTE BEST-GUESS ALIGNMENTS FOR ALL RUNS WITHIN AND ACROSS K
	print 'Finding best alignment for all runs within and across K'
	t3 = time.time()
	align.compute_alignments(pongdata, 2, opts.sim_threshold) # use a dummy worst_choice for now until we can remove compatibility
	t4 = time.time()

	if pongdata.print_all:
		# PRINT BEST-FIT ALIGNMENTS
		write.output_alignments(pongdata)


	# GENERATE COLOR INFO
	parse.convert_data(pongdata)
	distruct.generate_color_perms(pongdata)
	if len(pongdata.colors) > 0:
		if (pongdata.print_all):
			print 'Generating perm files for Distruct'
			distruct.generate_distruct_perm_files(pongdata, pongdata.colors)
	

	pongdata.status = 2
	
	# write.write_json(pongdata)

	print 'match time: %.2fs' % (t2-t1)
	print 'align time: %.2fs' % (t4-t3)
	print 'total time: %.2fs' % ((t2-t0)+(t4-t3))






class Application(tornado.web.Application):
	def __init__(self):
		handlers = [
			(r"/", MainHandler),
			(r"/pongsocket", WSHandler),
		]
		settings = dict(
			template_path=path.join(path.dirname(__file__), "templates"),
			static_path=path.join(path.dirname(__file__), "static"),
		)
		tornado.web.Application.__init__(self, handlers, **settings)


class MainHandler(tornado.web.RequestHandler):
	def get(self):
		self.render("pong.html")

class WSHandler(tornado.websocket.WebSocketHandler):
	global pongdata
	clients = set()

	def open(self):
		WSHandler.clients.add(self)
		
		# Code for running pong from the tornado app
		# Server is not asynchronous so it won't serve a partially-completed Pong object
		# if pongdata.status == 0:
			# global run_pong_args
			# run_pong(*run_pong_args)
		
		print 'New browser connection; generating visualization'
		pong_json_data = write.write_json(pongdata, True) #barplot, remove 'True' when done with branch

		self.write_message(json.dumps({'type': 'pong-data',
			'pong': pong_json_data},))



	def on_close(self):
		WSHandler.clients.remove(self)
		print 'Browser disconnected'

	# @classmethod
	# def update(cls, data):
	#	 for client in cls.clients:
	#		 client.write_message(data)

	def on_message(self, message):
		# logging.info("received message")

		data = json.loads(message)
		data = tornado.escape.json_decode(message)

		if data['type'] == 'button-clicked':
			# the tornado chat example has a diff way of doing this
			print 'received button click %s from client' % data['info']
			self.write_message(json.dumps({'type': 'button-response',
				'response':'nm u?'}))

		elif data['type'] == 'get-qmatrix': #received call from client on_message getQmatrix function call
			name = data['name']
			run = pongdata.runs[pongdata.name2id[name]] #returns run instance
			minor = data['minor']
			minorID = data['minorID']
			is_first = data['is_first']

			# print 'server received request for Q-matrix %s. Column perm %s.' % (name, str(run.alignment-1))
			# self.write_message(json.dumps({'type': 'q-matrix', 'name': name, 'K': run.K,
				# 'matrix': np.array([run.data[i] for i in run.alignment-1]).transpose().tolist()}))

			if minor=='yes':
				response = {'type':'q-matrix', 'name':name, 'K':run.K,
					'matrix2d':run.data_transpose_2d, 'minor':'yes', 'minorID':minorID, 'is_first':is_first} #'matrix3d':run.data_transpose_3d} 
			else:
				response = {'type':'q-matrix', 'name':name, 'K':run.K,
					'matrix2d':run.data_transpose_2d, 'minor':'no', 'minorID': None, 'is_first':None} #'matrix3d':run.data_transpose_3d} 
			

			self.write_message(json.dumps(response))


		# THIS MIGHT BE DEPRECATED WITH THE NEW PRINT WINDOW?
		elif data['type'] == 'svg':
			dl_dir = None
			try:
				dl_dir = path.expanduser('~/Downloads')
			except:
				pass
			if path.isdir(dl_dir):
				print 'Saving file %s.svg to your Downloads folder.' % data['name']
			else:
				dl_dir = pongdata.output_dir
				print 'Could not find Downloads folder; saving file %s.svg to the output dir.' % data['name']

			# filename = '.'+data['name']+'.svg'
			# svg2pdf(data['svg'], write_to=path.join(dl_dir, filename))
			with open(path.join(dl_dir,data['name']+'.svg'),'w') as f: f.write(data['svg'])
			# os.rename(path.join(dl_dir, filename), path.join(dl_dir, filename[1:])) # do not show file until it is complete

		elif data['type'] == 'multi-svg':
			svg_dir = path.join(pongdata.output_dir, 'plotSVGs')
			print 'Saving plot SVGs in %s.' % svg_dir

			# prepare SVG dir within output dir
			if path.isdir(svg_dir): rmtree(svg_dir)
			os.makedirs(svg_dir)

			for name,svg in data['svg-dict'].items():
				name = path.join(svg_dir,name)+'.svg'
				with open(name, 'w') as f: f.write(svg)


		else:
			sys.exit('Error: Received invalid socket message from client')





if __name__ == '__main__':
	main()
