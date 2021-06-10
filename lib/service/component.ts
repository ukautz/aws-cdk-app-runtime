import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as ecs from '@aws-cdk/aws-ecs';
import * as iam from '@aws-cdk/aws-iam';
import * as ssm from '@aws-cdk/aws-ssm';
import { Cluster, ClusterSpecs } from '../cluster';
import { Resources, ResourcesProps } from '../util';
import { loadContainerImage } from './image';

export interface ComponentProps {
  /**
   * The name of the service (unique in the cluster namespace and stage).
   *
   * Will be used to expose service externally and internally (see `exposed`)
   */
  name: string;

  /**
   * Can be `<dockerhub image>` or `ecr:<arn>` or `path:</to/folder/with/dockerfile>`
   */
  image: string | ecs.ContainerImage;

  /**
   * For dockerhub: added version tag
   * For ECR: added as version suffix to image ARN
   * For Local path: Added BUILD_TAG build argument
   */
  imageVersion?: string;

  /**
   * The docker build arguments to pass to the build process (if `image` property references a docker file containing directory)
   */
  dockerBuildArgs?: Record<string, string>;

  /**
   * The resources the service should get
   */
  resources?: ResourcesProps;

  /**
   * Optional environment variables in the form `{"ENV_NAME": "env value"}`, to be passed to container
   */
  environment?: Record<string, string>;
  /**
   * Optional secret environment variables in the form `{"ENV_NAME": "arn:ssm:..:key"}`, to be passed to container
   */
  secrets?: Record<string, string>;

  /**
   * Optional logging setup of container output
   */
  logging?: false | string | ecs.LogDriver;

  /**
   * Cluster specs can be either provided directly or as a prefix string to load from SSM
   */
  cluster: ClusterSpecs | Cluster | string | ((scope: cdk.Construct) => { cluster: ecs.ICluster; specs: ClusterSpecs });
}

/**
 * Super class for any Component that runs in a Cluster. Shared properties of Services and Tasks.
 */
export abstract class Component<ComponentT extends ComponentProps> extends cdk.Construct implements iam.IGrantable {
  /**
   * The name of the Component
   */
  public readonly name: string;

  /**
   * The Cluster this Component runs in
   */
  public readonly cluster: ecs.ICluster;

  /**
   * The specifications of the Cluster that this Component runs in
   */
  public readonly clusterSpecs: ClusterSpecs;

  /**
   * The auth principal for execution the running container of the Service will provide.
   * Should be granted access to databases and such.
   */
  public readonly taskRole: iam.Role;

  /**
   * The (docker) container image that implements this Component
   */
  public readonly image: ecs.ContainerImage;

  /**
   * Auth principle that executes (starts) the Component (containers).
   * MUST have access to repository that contains image.
   */
  public readonly taskExecutionRole: iam.Role;

  /**
   * The resources required by this Component
   */
  public readonly resources: Resources;

  public readonly taskDefinition: ecs.FargateTaskDefinition;

  constructor(scope: cdk.Construct, id: string, props: ComponentT) {
    super(scope, id);

    // initialize cluster specs
    this.name = props.name;

    if (typeof props.cluster === 'string') {
      this.clusterSpecs = ClusterSpecs.fromSsm(this, props.cluster);
    } else if (typeof props.cluster === 'function') {
      const { cluster, specs } = props.cluster(this);
      this.clusterSpecs = specs;
      this.cluster = cluster;
    } else if (props.cluster instanceof Cluster) {
      this.clusterSpecs = props.cluster.specs;
      this.cluster = props.cluster.cluster;
    } else {
      this.clusterSpecs = props.cluster;
    }
    if (!this.cluster) {
      this.cluster = specClusterLoader(this, this.clusterSpecs);
    }
    this.resources = new Resources(props.resources);
    this.taskRole = this.initTaskRole(props);
    this.taskExecutionRole = this.initTaskExecutionRole(props);
    this.image = this.initImage(props);
    this.taskDefinition = this.initTaskDefinition(props);

    function specClusterLoader(scope: cdk.Construct, specs: ClusterSpecs): ecs.ICluster {
      return ClusterSpecs.lookupCluster(scope, 'Cluster', specs);
    }
  }

  public get grantPrincipal(): iam.IPrincipal {
    return this.taskRole;
  }

  private initImage(props: ComponentProps): ecs.ContainerImage {
    if (typeof props.image !== 'string') {
      return props.image;
    }
    const { image, repository } = loadContainerImage(this, props.image, props.imageVersion, props.dockerBuildArgs);
    repository?.grantPull(this.taskExecutionRole);
    return image;
  }

  /**
   * See https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task-iam-roles.html
   *
   * @param props
   * @returns
   */
  private initTaskRole(props: ComponentT): iam.Role {
    return new iam.Role(this, 'TaskRole', {
      description: `role ${props.name} is provided to assume from within`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com', {
        /* conditions: {
          StringEquals: {
            'ecs:cluster': this.cluster.clusterArn,
          },
        }, */
      }),
    });
  }

  /**
   * See https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_execution_IAM_role.html
   * @param props
   * @returns
   */
  private initTaskExecutionRole(props: ComponentT): iam.Role {
    return new iam.Role(this, 'TaskExecutionRole', {
      description: `role assumed by ECS to start ${props.name}`,
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')],
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com', {
        /* conditions: {
          StringEquals: {
            'ecs:cluster': this.cluster.clusterArn,
          },
        }, */
      }),
    });
  }

  private initTaskDefinition(props: ComponentT): ecs.FargateTaskDefinition {
    return new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      cpu: this.resources.cpu,
      memoryLimitMiB: this.resources.memory,
      taskRole: this.taskRole,
      executionRole: this.taskExecutionRole,
    });
  }
}

export const secretsFromProps = (scope: cdk.Construct, secrets?: Record<string, string>): Record<string, ecs.Secret> =>
  Object.fromEntries(
    Object.entries(secrets ?? {}).map(([key, value]) => {
      return [
        key,
        ecs.Secret.fromSsmParameter(
          ssm.StringParameter.fromStringParameterName(scope, `ServiceContainerEnv${key}`, value)
        ),
      ];
    })
  );
