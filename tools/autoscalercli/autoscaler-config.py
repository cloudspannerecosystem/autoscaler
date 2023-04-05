""" Copyright 2023 Google LLC

 
  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at
 
      https://www.apache.org/licenses/LICENSE-2.0
 
  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License
 """


import argparse
import logging
import json
from google.cloud import scheduler_v1 as scheduler
from google.cloud.scheduler_v1 import PubsubTarget
from google.cloud.scheduler_v1 import Job
from google.protobuf import field_mask_pb2



def get_job(job):
    """Prints the autoscaler configuration data"""
    # Create a client
    client = scheduler.CloudSchedulerClient()

    # Initialize request argument(s)
    request = scheduler.GetJobRequest(name=job)

    # Make the request
    response = client.get_job(request=request)

    # Handle the response
    logging.debug(f"raw pubsub_target_data: {response.pubsub_target.data}")
    config = json.loads(response.pubsub_target.data)
    print(config)

def get_pubsubtopic(job):
    """returns pubsub_target topic name from existing configuration"""
    # Create a client
    client = scheduler.CloudSchedulerClient()

    # Initialize request argument(s)
    request = scheduler.GetJobRequest(name=job)

    # Make the request
    response = client.get_job(request=request)

    # Handle the response
    logging.debug(f"raw pubsub_target_topic_name: {response.pubsub_target.topic_name}")
    return response.pubsub_target.topic_name

def update_job(jobname, payload):
    """replaces the autoscaler configuration data"""
    # Create Client
    client = scheduler.CloudSchedulerClient()

    #Create Job
    job = scheduler.Job(name=jobname)

    #Create new pubsubtarget and populate with existing topic, and new payload
    pt = PubsubTarget()
    pt.data = payload
    #pull existing topic name
    pt.topic_name = get_pubsubtopic(jobname)
    job.pubsub_target = pt

    #create update mask
    update_mask = field_mask_pb2.FieldMask(paths=['pubsub_target'])
    request = scheduler.UpdateJobRequest(job=job,update_mask=update_mask)

    # Make the request
    response = client.update_job(request=request)
    # Handle the response
    if response.state != Job.State.UPDATE_FAILED:
        print(f"Job: {response.name} updated. Current status: {response.state.name}")

def parse_json(inputfile):
    """parses inputfile name and returns its as an encoded string """
    with open(inputfile) as file_object:
        contents = file_object.read().encode("utf-8")
        logging.debug(f"{inputfile} contains: \n{contents}")
        return contents


def main():
    parser = argparse.ArgumentParser(
        description='retrieve or replace autoscaler configurations with a Cloud Scheduler job')
    parser.add_argument('-v','--verbose', action='store_true',help='verbose output')

    subparser = parser.add_subparsers(dest="command",
                                      help='what the program should do', required=True)

    retriever = subparser.add_parser("retrieve",
                                     help='retrieve a configuration from specified cloud scheduler job',
                                     description='prints out the configuration in specified cloud scheduler job')
    retriever.add_argument("--jobname", help='name of cloud scheduler job', required=True)
    retriever.add_argument("--jobproject", help='project name of cloud scheduler job',required=True)
    retriever.add_argument("--jobregion", help='region of cloud scheduler job',required=True)

    replacer = subparser.add_parser("replace",
                                    help='replaces the existing configuration in specified cloud scheduler job',
                                    description="replaces the existing configuration in specified cloud scheduler job")
    replacer.add_argument('-f', '--filename', help='filename containing replacement config',required=True)
    replacer.add_argument("--jobname", help='name of cloud scheduler job', required=True)
    replacer.add_argument("--jobproject", help='project name of cloud scheduler job',required=True)
    replacer.add_argument("--jobregion", help='region of cloud scheduler job',required=True)


    args = parser.parse_args()
    if args.verbose:
        logging.basicConfig(level=logging.DEBUG)

    # Construct the fully qualified job path.
    job = f"projects/{args.jobproject}/locations/{args.jobregion}/jobs/{args.jobname}"

    if args.command == "replace":        
        update_job(job, parse_json(args.filename))
        #get_job(job)
    elif args.command == "retrieve":
        get_job(job)
    #


if __name__ == "__main__":
    main()
