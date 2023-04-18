import * as cdk from 'aws-cdk-lib';
import { aws_ec2 as ec2, aws_ecs as ecs, aws_servicediscovery as servicediscovery } from 'aws-cdk-lib';
import { Construct, IConstruct } from 'constructs';
import { ClusterSpecs } from '../cluster';
import { ecsLogDriver } from '../util/logging';
import { Component, ComponentProps, secretsFromProps } from './component';
import { Scaler } from './scaler';
import { ServiceSpecs } from './service-specs';

export interface ServiceProps extends ComponentProps {
  /**
   * Whether this component is exposed.
   * As a service that would be as an load balanced network endpoint at `https://<service>.public.domain`, in any case it would be available from within the cluster as `<service>.private.domain`.
   * As a task:
   * - has a Lambda interface, that allows to start, stop and get status of the task
   * - public means provides a REST API at `https://<service>.public.domain`,
   */
  public: boolean;

  /**
   * The port the container is exposing (when public==true), to which HTTP traffic is to be routed
   *
   * Default: 80
   */
  containerPort?: number;
}

/**
 * Aspect that can be applied to services forcing WEIGHTED routing policy.
 *
 * This is a HACK-AROUND since FargateService API does not allow to set routing policy, which
 * then defaults to the default, which is MULTIVALUE
 *
 * @see https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-ecs.FargateService.html#cloudmapoptions - misses option to set routing policy
 */
class EnforceWeightedRoutingForService implements cdk.IAspect {
  public visit(node: IConstruct): void {
    if (!(node instanceof servicediscovery.CfnService)) {
      return;
    }
    node.dnsConfig = {
      ...(node.dnsConfig as servicediscovery.CfnService.DnsConfigProperty),
      routingPolicy: servicediscovery.RoutingPolicy.WEIGHTED,
    };
  }
}

/**
 * A runtime service runs continuously and never stops. Think of a web service, mail service etc.
 */
export class Service extends Component<ServiceProps> implements ec2.IConnectable {
  public readonly service: ecs.FargateService;

  constructor(scope: Construct, id: string, props: ServiceProps) {
    super(scope, id, props);

    const mode = props.resources?.scaling?.mode ?? 'fixed';
    if (!['fixed', 'scaling'].includes(mode)) {
      throw new Error(`Service requires resource scaling mode "fixed" or "scaling", unsupported: "${mode}"`);
    }

    this.service = this.initService(props);
    this.setupAutoScaling();
    this.setupRoutingPermissions(props);
  }

  public get specs(): ServiceSpecs {
    return {
      cluster: this.cluster.clusterName,
      iamPrincipal: this.taskRole.roleArn,
      privateHostname: `${this.name}.${this.clusterSpecs.privateDomain}`,
      publicHostname: `${this.name}.${this.clusterSpecs.publicDomain}`,
      resources: this.resources.toString(),
      securityGroupIds: this.service.connections.securityGroups
        .map((sg) => sg.securityGroupId)
        .sort()
        .join(','),
      service: this.name,
    };
  }

  public get connections(): ec2.Connections {
    return this.service.connections;
  }

  /**
   * Create service in ECS cluster
   */
  private initService(props: ServiceProps): ecs.FargateService {
    // enable traffic for public services only
    const traefikLabels = props.public
      ? {
          'traefik.enable': 'true',
          [`traefik.http.routers.${props.name}.rule`]: `Host(\`${props.name}.${this.clusterSpecs.publicDomain}\`)`,
        }
      : {
          'traefik.enable': 'false',
        };

    // attach docker container to task
    const container = this.taskDefinition.addContainer('ServiceContainer', {
      image: this.image,
      logging: ecsLogDriver(props.logging ?? `/service/${props.name}`),
      environment: props.environment,
      secrets: secretsFromProps(this, props.secrets),
      dockerLabels: {
        'runtime.resources': this.resources.toString(),
        ...traefikLabels,
      },
    });

    // port mapping exposes the container
    const port = props.containerPort ?? 80;
    container.addPortMappings({
      containerPort: port,
      hostPort: port,
      protocol: ecs.Protocol.TCP,
    });

    // for private address, require (cloudmap / servicediscovery) namespace
    const cloudMapNamespace =
      this.cluster.defaultCloudMapNamespace ??
      ClusterSpecs.lookupPrivateNamespace(this, 'PrivateNamespace', this.clusterSpecs);

    const service = new ecs.FargateService(this, 'Service', {
      cluster: this.cluster,
      taskDefinition: this.taskDefinition,
      cloudMapOptions: {
        cloudMapNamespace,
        name: props.name,
      },
      ...(this.resources.scaling.mode === 'fixed' ? { desiredCount: this.resources.scaling.amount } : {}),
    });

    // weighted routing gives us a poor mans load balancer - makes more sense than
    // every client having to implement that itself by MULTIVALUE ip address set
    // @see
    cdk.Aspects.of(service).add(new EnforceWeightedRoutingForService());

    return service;
  }

  /**
   * Grant traffic routing from load balancer
   */
  private setupRoutingPermissions(props: ServiceProps): void {
    // only grant routing permissions to router if public routing is enabled
    if (!props.public) {
      return;
    }

    // load connection to router service, to grant it's permission to route traffic to this service
    const routerSecurityGroups = this.clusterSpecs.routerSecurityGroupIds
      .split(',')
      .map((id, idx) => ec2.SecurityGroup.fromSecurityGroupId(this, `SecurityGroup${idx + 1}`, id));
    const routerConnections = new ec2.Connections({
      securityGroups: routerSecurityGroups,
    });

    // traffic from router may flow to service
    this.service.connections.allowFrom(
      routerConnections,
      new ec2.Port({
        protocol: ec2.Protocol.TCP,
        fromPort: 80,
        toPort: 80,
        stringRepresentation: 'HTTP',
      })
    );
  }

  /**
   * Configures services scaling configuration
   */
  private setupAutoScaling(): void {
    if (this.resources.scaling.mode !== 'scaling') return;
    new Scaler(this, 'Scaler', {
      scaling: this.resources.scaling,
      service: this.service,
    });
  }
}
