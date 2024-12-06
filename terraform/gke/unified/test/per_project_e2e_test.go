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
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"testing"
	"time"

	instance "cloud.google.com/go/spanner/admin/instance/apiv1"
	instancepb "cloud.google.com/go/spanner/admin/instance/apiv1/instancepb"

	logger "github.com/gruntwork-io/terratest/modules/logger"
	retry "github.com/gruntwork-io/terratest/modules/retry"
	terraform "github.com/gruntwork-io/terratest/modules/terraform"
	test_structure "github.com/gruntwork-io/terratest/modules/test-structure"

	envconfig "github.com/sethvargo/go-envconfig"
	assert "github.com/stretchr/testify/assert"
)

type TestConfig struct {
	ProjectId string `env:"PROJECT_ID,required"`
	Region    string `env:"REGION,required"`
}

func waitForSpannerProcessingUnits(t *testing.T, instanceAdmin *instance.InstanceAdminClient, instanceId string, targetProcessingUnits int32, retries int, sleepBetweenRetries time.Duration) error {

	ctx := context.Background()
	status := fmt.Sprintf("Wait for instance to reach %d PUs...", targetProcessingUnits)

	message, err := retry.DoWithRetryE(
		t,
		status,
		retries,
		sleepBetweenRetries,
		func() (string, error) {
			spannerInstanceReq := &instancepb.GetInstanceRequest{
				Name: instanceId,
			}
			spannerInstance, err := instanceAdmin.GetInstance(ctx, spannerInstanceReq)
			if err != nil {
				return "", err
			}
			assert.NotNil(t, spannerInstance)
			processingUnits := spannerInstance.GetProcessingUnits()
			if processingUnits != targetProcessingUnits {
				return "", fmt.Errorf("Currently %d PUs", processingUnits)
			}
			return "Spanner instance reached target PUs", nil
		},
	)
	logger.Log(t, message)
	return err
}

func deployAutoscaler(t *testing.T, projectId string, region string, targetShards int32) error {

	deployScript := "./gke_deploy.sh"
	deployArgs := []string{
		deployScript,
		projectId,
		region,
		strconv.Itoa(int(targetShards)),
	}

	cmd := &exec.Cmd{
		Path:   deployScript,
		Args:   deployArgs,
		Stdout: os.Stdout,
		Stderr: os.Stderr,
	}

	logger.Log(t, "Executing deploy script with args:", cmd)

	err := cmd.Start()
	if err != nil {
		logger.Log(t, "There was an error starting the deploy script:")
		logger.Log(t, err)
		return err
	}

	err = cmd.Wait()
	if err != nil {
		logger.Log(t, "There was an error waiting for the deploy script:")
		logger.Log(t, err)
		return err
	}

	return nil
}

func TestPerProjectEndToEndDeployment(t *testing.T) {

	const (
		spannerName                  = "autoscale-test"
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
				"region":                        config.Region,
				"spanner_name":                  spannerName,
				"terraform_spanner_test":        true,
				"terraform_spanner_state":       true,
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

	test_structure.RunTestStage(t, "apply", func() {
		terraformOptions := test_structure.LoadTerraformOptions(t, terraformDir)
		terraform.ApplyAndIdempotent(t, terraformOptions)
	})

	test_structure.RunTestStage(t, "validate", func() {
		ctx := context.Background()

		const retries = 30
		const sleepBetweenRetries = time.Second * 10

		instanceAdmin, err := instance.NewInstanceAdminClient(ctx)
		assert.Nil(t, err)
		assert.NotNil(t, instanceAdmin)
		defer instanceAdmin.Close()

		spannerInstanceId := fmt.Sprintf("projects/%s/instances/%s", config.ProjectId, spannerName)
		logger.Log(t, fmt.Sprintf("Using instance ID: %s", spannerInstanceId))

		// Wait for Spanner to report initial processing units
		assert.Nil(t, waitForSpannerProcessingUnits(t, instanceAdmin, spannerInstanceId, spannerTestProcessingUnits, retries, sleepBetweenRetries))

		// Deploy the autoscaler
		assert.Nil(t, deployAutoscaler(t, config.ProjectId, config.Region, spannerTargetProcessingUnits))

		// Wait up to five minutes for Spanner to report final processing units
		assert.Nil(t, waitForSpannerProcessingUnits(t, instanceAdmin, spannerInstanceId, spannerTargetProcessingUnits, retries, sleepBetweenRetries))
	})
}
