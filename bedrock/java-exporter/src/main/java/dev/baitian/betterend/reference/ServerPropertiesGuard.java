package dev.baitian.betterend.reference;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Properties;

/** Runs before the game JVM; Java itself interprets escapes, continuations and duplicate keys. */
public final class ServerPropertiesGuard {
    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("Expected the owned reference-server directory");
        Path server = Path.of(args[0]).toRealPath();
        Properties properties = load(server.resolve("server.properties"));
        Map<String, String> expected = Map.of(
                "server-ip", "127.0.0.1", "server-port", "25585", "level-name", "betterend-reference",
                "white-list", "true", "enforce-whitelist", "true", "max-players", "1",
                "enable-rcon", "false", "enable-query", "false", "management-server-enabled", "false");
        for (var entry : expected.entrySet()) {
            if (!entry.getValue().equals(properties.getProperty(entry.getKey()))) {
                throw new IllegalStateException("Unsafe effective reference property: " + entry.getKey());
            }
        }
        if (!"true".equals(load(server.resolve("eula.txt")).getProperty("eula"))) {
            throw new IllegalStateException("Minecraft EULA acceptance is required; the guard does not grant it");
        }
        Path world = server.resolve(properties.getProperty("level-name"));
        if (Files.exists(world) && !world.toRealPath().startsWith(server)) {
            throw new IllegalStateException("Reference world resolves outside the owned server");
        }
        System.out.println("BETTEREND_REFERENCE_PROPERTIES verified");
    }

    private static Properties load(Path path) throws Exception {
        Properties properties = new Properties();
        try (var reader = Files.newBufferedReader(path, StandardCharsets.UTF_8)) {
            properties.load(reader);
        }
        return properties;
    }
}
