import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
APP_DIR = PROJECT_ROOT / 'templates'

bind = os.getenv('GUNICORN_BIND', '0.0.0.0:5000')
workers = int(os.getenv('GUNICORN_WORKERS', '1'))
threads = int(os.getenv('GUNICORN_THREADS', '2'))
backlog = 512
chdir = str(APP_DIR)
access_log_format = '%(t)s %(p)s %(h)s "%(r)s" %(s)s %(L)s %(b)s %(f)s" "%(a)s"'
loglevel = os.getenv('GUNICORN_LOGLEVEL', 'info')
worker_class = 'sync'
errorlog = os.getenv('GUNICORN_ERROR_LOG', '-')
accesslog = os.getenv('GUNICORN_ACCESS_LOG', '-')
