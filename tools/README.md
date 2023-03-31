# Spanner Autoscaler Commandline Configuration Tool 

This example python script allows replacing a Cloud Spanner Autoscaler configuration without use of the GCP Console. 
It also allows retrieving the current configuration to stdout.

The script needs to know the exactly Cloud Scheduler job it will be updating, as described by:
the name of the job, the project and the region it resides in. 

The file input will the same configuration as described in the poller [documentation](https://github.com/cloudspannerecosystem/autoscaler/blob/master/poller/README.md). 

## Requirements
* google-cloud-scheduler python package
```
pip install google-cloud-scheduler
```


## Usage
### retrieve
```
usage: autoscale.py retrieve [-h] --jobname JOBNAME --jobproject JOBPROJECT --jobregion JOBREGION

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
```
usage: autoscale.py replace [-h] -f FILENAME --jobname JOBNAME --jobproject JOBPROJECT --jobregion JOBREGION

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

## Licensing

```lang-none
Copyright 2023 Google LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```
