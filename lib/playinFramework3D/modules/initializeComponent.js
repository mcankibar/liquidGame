/**
 *
 * @param props.componentId - string,
 * @param props.componentClass - class,
 * @param props.componentConfig - object,
 * @param props.componentsMap - map,
 * @param props.componentsReadyStatusMap - map,
 * @param props.onComponentsReady - function
 *
 */
export function initializeComponent(props) {
  const componentId = props.componentId;
  const componentConfig = props.componentConfig;
  const componentClass = props.componentClass;
  const componentsMap = props.componentsMap;
  const onComponentsReady = props.onComponentsReady;
  const componentsReadyStatusMap = props.componentsReadyStatusMap;

  componentsMap.set(componentId, new componentClass(componentConfig));
  const component = componentsMap.get(componentId);
  component.componentId = componentId;
  componentsReadyStatusMap.set(componentId, false);
  component.onReady = () => {
    componentsReadyStatusMap.set(componentId, true);
    if (Array.from(componentsReadyStatusMap.values()).every((currentValue) => currentValue === true)) {
      onComponentsReady();
    }
  };
  return component;
}
