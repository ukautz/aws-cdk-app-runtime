export interface ComponentSpecs {
  /**
   * Name of the cluster that this component runs in
   */
  cluster: string;

  /**
   * The ARN of the IAM role / principal that the runtime provides to the running Service
   */
  iamPrincipal: string;

  /**
   * Runtime resource and property requirements of this component
   */
  resources: string;

  /**
   * Security groups that the executed Service has, separated by ","
   */
  securityGroupIds: string;
}
