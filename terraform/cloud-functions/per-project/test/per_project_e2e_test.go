//go:build e2e

/**
 * Copyright 2023 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package test

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	scheduler "cloud.google.com/go/scheduler/apiv1beta1"
	schedulerpb "cloud.google.com/go/scheduler/apiv1beta1/schedulerpb"
	instance "cloud.google.com/go/spanner/admin/instance/apiv1"
	instancepb "cloud.google.com/go/spanner/admin/instance/apiv1/instancepb"
	fieldmaskpb "google.golang.org/protobuf/types/known/fieldmaskpb"

	logger "github.com/gruntwork-io/terratest/modules/logger"
	retry "github.com/gruntwork-io/terratest/modules/retry"
	terraform "github.com/gruntwork-io/terratest/modules/terraform"
	test_structure "github.com/gruntwork-io/terratest/modules/test-structure"

	envconfig "github.com/sethvargo/go-envconfig"
	assert "github.com/stretchr/testify/assert"
)

type TestConfig struct {
	ProjectId string `env:"PROJECT_ID,required"`
}

func setAutoscalerConfigMinProcessingUnits(t *testing.T, schedulerClient *scheduler.CloudSchedulerClient, schedulerJobId string, units int) {

	ctx := context.Background()
	schedulerJobReq := &schedulerpb.GetJobRequest{
		Name: schedulerJobId,
	}
	assert.NotNil(t, schedulerJobReq)
	schedulerJob, err := schedulerClient.GetJob(ctx, schedulerJobReq)
	assert.Nil(t, err)
	assert.NotNil(t, schedulerJob)

	var schedulerJobBody []map[string]any
	schedulerJobBodyRaw := string(schedulerJob.GetPubsubTarget().GetData())
	err = json.Unmarshal([]byte(schedulerJobBodyRaw), &schedulerJobBody)
	if err != nil {
		logger.Log(t, err)
		t.Fatal()
	}

	schedulerJobBody[0]["minSize"] = units
	schedulerJobBodyUpdate, err := json.Marshal(schedulerJobBody)
	if err != nil {
		logger.Log(t, err)
		t.Fatal()
	}

	updateJobRequest := &schedulerpb.UpdateJobRequest{
		Job: &schedulerpb.Job{
			Name: schedulerJob.Name,
			Target: &schedulerpb.Job_PubsubTarget{
				PubsubTarget: &schedulerpb.PubsubTarget{
					Data: []byte(schedulerJobBodyUpdate),
				},
			},
		},
		UpdateMask: &fieldmaskpb.FieldMask{
			Paths: []string{"pubsub_target.data"},
		},
	}

	_, err = schedulerClient.UpdateJob(ctx, updateJobRequest)
	if err != nil {
		logger.Log(t, err)
		t.Fatal()
	}
}

func waitForSpannerProcessingUnits(t *testing.T, instanceAdmin *instance.InstanceAdminClient, instanceId string, targetProcessingUnits int32, retries int, sleepBetweenRetries time.Duration) {

	ctx := context.Background()
	status := fmt.Sprintf("Wait for instance to reach %d PUs...", targetProcessingUnits)

	message := retry.DoWithRetry(
		t,
		status,
		retries,
		sleepBetweenRetries,
		func() (string, error) {
			spannerInstanceReq := &instancepb.GetInstanceRequest{
				Name: instanceId,
			}
			spannerInstance, err := instanceAdmin.GetInstance(ctx, spannerInstanceReq)
			assert.Nil(t, err)
			assert.NotNil(t, spannerInstance)
			processingUnits := spannerInstance.GetProcessingUnits()
			if processingUnits != targetProcessingUnits {
				return "", fmt.Errorf("Currently %d PUs", processingUnits)
			}
			return "Spanner instance reached target PUs", nil
		},
	)
	logger.Log(t, message)
}

func TestPerProjectEndToEndDeployment(t *testing.T) {

	const (
		schedulerJobTfOutput         = "scheduler_job_id"
		spannerName                  = "autoscaler-test"
		spannerTestProcessingUnits   = 100
		spannerTargetProcessingUnits = 200
	)

	var config TestConfig

	ctx := context.Background()
	err := envconfig.Process(ctx, &config)
	if err != nil {
		logger.Log(t, "There was an error processing the supplied environment variables:")
		logger.Log(t, err)
		t.Fatal()
	}

	terraformDir := "../"

	test_structure.RunTestStage(t, "setup", func() {
		terraformOptions := &terraform.Options{
			TerraformDir: terraformDir,
			Vars: map[string]interface{}{
				"project_id":                    config.ProjectId,
				"region":                        "us-central1",
				"spanner_name":                  spannerName,
				"terraform_spanner_test":        true,
				"spanner_test_processing_units": spannerTestProcessingUnits,
			},
			NoColor: true,
		}

		test_structure.SaveTerraformOptions(t, terraformDir, terraformOptions)
		terraform.Init(t, terraformOptions)
	})

	defer test_structure.RunTestStage(t, "teardown", func() {
		terraformOptions := test_structure.LoadTerraformOptions(t, terraformDir)
		terraform.Destroy(t, terraformOptions)
	})

	test_structure.RunTestStage(t, "import", func() {
		terraformOptions := test_structure.LoadTerraformOptions(t, terraformDir)
		terraformArgs := []string{"module.scheduler.google_app_engine_application.app", config.ProjectId}
		terraformArgsFormatted := append(terraform.FormatArgs(terraformOptions, "-input=false"), terraformArgs...)
		terraformCommand := append([]string{"import"}, terraformArgsFormatted...)
		terraform.RunTerraformCommand(t, terraformOptions, terraformCommand...)
	})

	test_structure.RunTestStage(t, "apply", func() {
		terraformOptions := test_structure.LoadTerraformOptions(t, terraformDir)
		terraform.ApplyAndIdempotent(t, terraformOptions)
	})

	test_structure.RunTestStage(t, "validate", func() {
		terraformOptions := test_structure.LoadTerraformOptions(t, terraformDir)
		ctx := context.Background()

		instanceAdmin, err := instance.NewInstanceAdminClient(ctx)
		assert.Nil(t, err)
		assert.NotNil(t, instanceAdmin)
		defer instanceAdmin.Close()

		schedulerJobId := terraform.Output(t, terraformOptions, schedulerJobTfOutput)
		schedulerClient, err := scheduler.NewCloudSchedulerClient(ctx)
		assert.Nil(t, err)
		assert.NotNil(t, schedulerClient)
		defer schedulerClient.Close()

		// Wait up to a minute for Spanner to report initial processing units
		spannerInstanceId := fmt.Sprintf("projects/%s/instances/%s", config.ProjectId, spannerName)
		waitForSpannerProcessingUnits(t, instanceAdmin, spannerInstanceId, spannerTestProcessingUnits, 6, time.Second*10)

		// Update the autoscaler config with a new minimum number of processing units
		setAutoscalerConfigMinProcessingUnits(t, schedulerClient, schedulerJobId, spannerTargetProcessingUnits)

		// Wait up to five minutes for Spanner to report final processing units
		waitForSpannerProcessingUnits(t, instanceAdmin, spannerInstanceId, spannerTargetProcessingUnits, 5*6, time.Second*10)
	})
}
