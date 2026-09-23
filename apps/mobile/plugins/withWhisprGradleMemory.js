const { withGradleProperties } = require("expo/config-plugins");

// `:app:packageDebug` ran out of heap at 2 GB while packaging the two-ABI APK
// (IncrementalSplitterRunnable -> OutOfMemoryError: Java heap space).
const GRADLE_JVM_ARGS = "-Xmx4096m -XX:MaxMetaspaceSize=1024m";
// The Kotlin daemon inherits the Gradle arguments unless set. Pin it at its
// previous 2 GB so only the Gradle daemon grows on memory-limited CI runners.
const KOTLIN_DAEMON_JVM_ARGS = "-Xmx2048m -XX:MaxMetaspaceSize=1024m";

function setGradleProperty(properties, key, value) {
  const existing = properties.find(
    (property) => property.type === "property" && property.key === key,
  );

  if (existing) {
    existing.value = value;
  } else {
    properties.push({ type: "property", key, value });
  }
}

module.exports = function withWhisprGradleMemory(config) {
  return withGradleProperties(config, (configWithProperties) => {
    setGradleProperty(configWithProperties.modResults, "org.gradle.jvmargs", GRADLE_JVM_ARGS);
    setGradleProperty(
      configWithProperties.modResults,
      "kotlin.daemon.jvmargs",
      KOTLIN_DAEMON_JVM_ARGS,
    );

    return configWithProperties;
  });
};
