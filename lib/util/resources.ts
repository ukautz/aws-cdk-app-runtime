export interface ScalingThreshold {
  resource: string;
  target: number;
}

export type ScalingType =
  | {
      mode: 'fixed';
      amount: number;
    }
  | {
      mode: 'scaling';
      minCapacity: number;
      maxCapacity: number;
      thresholds: ScalingThreshold[];
    }
  | {
      mode: 'concurrent';
      concurrent: number;
    };

export interface ResourcesProps {
  cpu?: number;
  memory?: number;
  scaling?: ScalingType;
}

/**
 * Describes the resources and properties that a runtime most provide
 */
export class Resources implements ResourcesProps {
  private readonly props: ResourcesProps | undefined;

  constructor(props?: ResourcesProps) {
    this.props = this.checkProps(props);
  }

  /**
   * Assures provided resources are valid
   *
   * @param props
   * @returns
   */
  private checkProps(props?: ResourcesProps): ResourcesProps | undefined {
    if (props?.scaling?.mode === 'scaling') {
      // requires threshold
      if (!props.scaling.thresholds) throw new Error('missing thresholds');
      const seen: Record<string, number> = {};
      props.scaling.thresholds.forEach((threshold) => {
        seen[threshold.resource] = (seen[threshold.resource] ?? 0) + 1;
      });
      const duplicate = Object.keys(seen).filter((key) => seen[key] > 1);
      if (duplicate.length > 0) throw new Error(`duplicate thresholds for: ${duplicate.sort().join(', ')}`);
    }
    return props;
  }

  /**
   * Creates a new ServiceResources from formatted string in the form `cpu:123, memory:234, min: 2, max: 10, target_cpu: 50, ...`.
   *
   * For parameters see `fromJson()` method
   *
   * Examples:
   *
   * @see fromJson
   * @param resources
   */
  public static fromString(resources: string): Resources {
    const json: Record<string, string> = {};
    resources.split(/\s*,\s*/).forEach((part) => {
      const parts = part.split(/\s*:\s*/, 2);
      json[parts[0]] = parts[1];
    });
    return Resources.fromJson(json);
  }

  /**
   * Creates ServiceResources from JSON in the form:
   *
   * <code>
   * {
   *  // amount of CPU (1024 = 1 VPCU)
   *  "cpu": 123,
   *
   *  // amount of memory in MiB
   *  "memory": 123,
   *
   *  // for "fixed" mode:
   *  // amount of instances to start
   *  "fixed": 1,
   *
   *  // for "concurrent" mode:
   *  // amount of max concurrent executions
   *  "concurrent": 1,
   *
   *  // for "scaling" mode:
   *  // minimal amount of instances (never scale below this amount)
   *  "min": 1,
   *
   *  // maximum amount of instances (never scale above this amount)
   *  "max": 5,
   *
   *  // targeted CPU usage in percent; scale down if below, up if above
   *  "target_cpu": 65,
   *
   *  // targeted Memory usage in percent; scale down if below, up if above
   *  "target_memory": 85,
   * }
   * </code>
   * @param encoded
   */
  public static fromJson(encoded: Record<string, string>): Resources {
    let props: Partial<ResourcesProps> = {};
    if ('cpu' in encoded) props.cpu = parseInt(encoded['cpu']);
    if ('memory' in encoded) props.memory = parseInt(encoded['memory']);
    if ('fixed' in encoded) {
      props.scaling = { mode: 'fixed', amount: parseInt(encoded['fixed']) };
    } else if ('concurrent' in encoded) {
      props.scaling = { mode: 'concurrent', concurrent: parseInt(encoded['concurrent']) };
    } else {
      const thresholds = Object.keys(encoded)
        .filter((key) => key.startsWith('target_'))
        .map((key) => {
          const name = key.substr('target_'.length);
          return { resource: name, target: parseInt(encoded[key]) };
        });
      props.scaling = {
        mode: 'scaling',
        minCapacity: parseInt(encoded['min']),
        maxCapacity: parseInt(encoded['max']),
        thresholds: thresholds as ScalingThreshold[],
      };
    }
    return new Resources(props as ResourcesProps);
  }

  public get cpu(): number {
    return Math.floor(this.props?.cpu ?? 256);
  }

  public get memory(): number {
    return Math.floor(this.props?.memory ?? 512);
  }

  public get scaling(): ScalingType {
    return this.props?.scaling ?? { mode: 'fixed', amount: 1 };
  }

  public toString(): string {
    const json = this.toJson();
    return ['cpu', 'memory', 'fixed', 'concurrent', 'min', 'max']
      .filter((key) => key in json)
      .concat(
        Object.keys(json)
          .filter((key) => key.startsWith('target_'))
          .sort()
      )
      .map((key) => `${key}: ${json[key]}`)
      .join(', ');
  }

  public toJson(): Record<string, string> {
    const result: Record<string, string> = {
      cpu: `${this.cpu}`,
      memory: `${this.memory}`,
    };
    const scaling = this.scaling;
    switch (scaling.mode) {
      case 'fixed':
        result['fixed'] = `${scaling.amount}`;
        break;
      case 'concurrent':
        result['concurrent'] = `${scaling.concurrent}`;
        break;
      case 'scaling':
        result['min'] = `${scaling.minCapacity}`;
        result['max'] = `${scaling.maxCapacity}`;
        scaling.thresholds.forEach((threshold) => {
          result[`target_${threshold.resource}`] = `${threshold.target}`;
        });
        break;
    }
    return result;
  }
}
