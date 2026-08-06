const { withGradleProperties } = require("expo/config-plugins");

const GRADLE_JVM_ARGS = "-Xmx2048m -XX:MaxMetaspaceSize=1024m";

module.exports = function withWhisprGradleMemory(config) {
  return withGradleProperties(config, (configWithProperties) => {
    const existing = configWithProperties.modResults.find(
      (property) => property.type === "property" && property.key === "org.gradle.jvmargs",
    );

    if (existing) {
      existing.value = GRADLE_JVM_ARGS;
    } else {
      configWithProperties.modResults.push({
        type: "property",
        key: "org.gradle.jvmargs",
        value: GRADLE_JVM_ARGS,
      });
    }

    return configWithProperties;
  });
};
