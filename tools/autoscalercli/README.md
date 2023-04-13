# Autoscaler Commandline Configuration Tool

This example python script allows replacing an Autoscaler configuration without
use of the GCP Console. It also allows retrieving the current configuration to
stdout.

## Requirements

* google-cloud-scheduler python package

```bash
pip install google-cloud-scheduler
```

## Usage

### retrieve

To retrieve the existing configuration the script needs to know the exact Cloud
Scheduler job identified by:
the name of the job, the project and the region it resides in.

```bash
usage: autoscale.py retrieve [-h] --jobname JOBNAME --jobproject JOBPROJECT
      --jobregion JOBREGION

prints out the configuration in specified cloud scheduler job

options:
  -h, --help            show this help message and exit
  --jobname JOBNAME     name of cloud scheduler job
  --jobproject JOBPROJECT
                        project name of cloud scheduler job
  --jobregion JOBREGION
                        region of cloud scheduler job
```

### replace

To replace the existing configuration the script needs to know the exact Cloud
Scheduler job identified by:
the name of the job, the project and the region it resides in.

The file input will the same configuration as described in the poller
[documentation](https://github.com/cloudspannerecosystem/autoscaler/blob/master/poller/README.md).

```bash
usage: autoscale.py replace [-h] -f FILENAME --jobname JOBNAME
      --jobproject JOBPROJECT --jobregion JOBREGION

replaces the existing configuration in specified cloud scheduler job

options:
  -h, --help            show this help message and exit
  -f FILENAME, --filename FILENAME
                        filename containing replacement config
  --jobname JOBNAME     name of cloud scheduler job
  --jobproject JOBPROJECT
                        project name of cloud scheduler job
  --jobregion JOBREGION
                        region of cloud scheduler job
```
