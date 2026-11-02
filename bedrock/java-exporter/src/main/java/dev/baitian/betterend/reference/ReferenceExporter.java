package dev.baitian.betterend.reference;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonNull;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import com.google.gson.JsonParser;
import com.google.gson.stream.JsonWriter;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.JsonOps;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.registry.FlammableBlockRegistry;
import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.loader.api.ModContainer;
import net.fabricmc.loader.api.metadata.ModOrigin;
import net.minecraft.core.HolderLookup;
import net.minecraft.core.component.BlockTransformer;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.component.TypedDataComponent;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.RegistryOps;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.packs.resources.Resource;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.Property;

import java.io.BufferedWriter;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/** Production-server observations only; this does not execute Bedrock or certify a port. */
public final class ReferenceExporter implements ModInitializer {
    private static final String SOURCE_COMMIT = "5a25059ef4fd77409024a2919fb0a0098388104f";
    private static final Set<String> CONTENT_NAMESPACES = Set.of("betterend", "bclib", "wover", "wunderlib");
    private static final Gson GSON = new GsonBuilder().disableHtmlEscaping().serializeNulls().create();

    @Override
    public void onInitialize() {
        ServerLifecycleEvents.SERVER_STARTED.register(this::exportAndStop);
    }

    private void exportAndStop(MinecraftServer server) {
        JsonObject receipt = new JsonObject();
        receipt.addProperty("sourceCommit", SOURCE_COMMIT);
        receipt.addProperty("scope", "production-server-registry-and-default-components-not-port-certification");
        try {
            Path workspace = requiredPath("betterend.reference.workspace").toRealPath();
            Path output = requiredPath("betterend.reference.output").toAbsolutePath().normalize();
            validateOutput(workspace, output);
            JsonArray issues = new JsonArray();
            FabricLoader loader = FabricLoader.getInstance();
            boolean production = !loader.isDevelopmentEnvironment()
                    && !System.getProperties().containsKey("fabric-api.datagen")
                    && !System.getProperties().containsKey("fabric-api.gametest");
            if (!production) issue(issues, "environment", "Reference export was not launched in the required production profile");
            if (!"26.3".equals(server.getServerVersion())) issue(issues, "environment", "Unexpected Minecraft version: " + server.getServerVersion());

            HolderLookup.Provider registries = server.reloadableRegistries().lookup();
            RegistryOps<JsonElement> ops = registries.createSerializationContext(JsonOps.INSTANCE);
            JsonObject root = new JsonObject();
            root.addProperty("schemaVersion", 3);
            root.addProperty("sourceCommit", SOURCE_COMMIT);
            root.addProperty("exportScope", "live-production-registry-defaults-and-intrinsic-components");
            root.add("environment", environment(server, loader, workspace, production));
            root.add("blocks", exportBlocks());
            root.add("items", exportItems(ops, issues));
            root.add("entities", exportEntities());
            root.add("biomes", exportBiomes(server, ops, issues));
            root.add("registryTags", exportRegistryTags(registries));
            root.add("effectiveDataResources", exportDataResources(server, issues));
            root.add("availableRegistryIds", strings(registries.listRegistryKeys().map(key -> key.identifier().toString()).sorted().toList()));
            root.add("issues", issues);
            JsonArray scopeLimits = new JsonArray();
            scopeLimits.add("Context-dependent collision, placement, redstone and AI behavior require separate in-world scenarios; they are not inferred from registry defaults.");
            scopeLimits.add("Item default components are encoded after normal server loading, not inferred from pristine ItemStack patches or datagen initializers.");
            scopeLimits.add("Conditional integrations are covered only for the recorded loaded-mod and enabled-pack profile.");
            root.add("scopeLimits", scopeLimits);
            boolean complete = issues.isEmpty() && production;
            root.addProperty("complete", complete);
            Path temporary = output.resolveSibling(output.getFileName() + ".writing");
            try (BufferedWriter writer = Files.newBufferedWriter(temporary, StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
                 JsonWriter json = new JsonWriter(writer)) {
                json.setIndent("  ");
                writeCanonical(root, json);
            }
            Files.move(temporary, output, StandardCopyOption.ATOMIC_MOVE);
            receipt.addProperty("status", complete ? "complete" : "incomplete");
            receipt.addProperty("output", workspace.relativize(output).toString().replace('\\', '/'));
            receipt.addProperty("sha256", sha256(output));
            receipt.addProperty("blocks", root.getAsJsonArray("blocks").size());
            receipt.addProperty("items", root.getAsJsonArray("items").size());
            receipt.addProperty("entities", root.getAsJsonArray("entities").size());
            receipt.addProperty("biomes", root.getAsJsonArray("biomes").size());
            receipt.addProperty("issues", issues.size());
        } catch (Exception error) {
            receipt.addProperty("status", "failed");
            receipt.addProperty("errorType", error.getClass().getName());
            receipt.addProperty("error", error.getMessage());
            error.printStackTrace(System.err);
        } finally {
            System.out.println("BETTEREND_REFERENCE_EXPORT " + GSON.toJson(receipt));
            server.halt(false);
        }
    }

    private static JsonArray exportBlocks() {
        List<Block> blocks = new ArrayList<>();
        for (Block block : BuiltInRegistries.BLOCK) {
            if (included(BuiltInRegistries.BLOCK.getKey(block))) blocks.add(block);
        }
        blocks.sort(Comparator.comparing(block -> BuiltInRegistries.BLOCK.getKey(block).toString()));
        JsonArray output = new JsonArray();
        for (Block block : blocks) {
            JsonObject entry = new JsonObject();
            entry.addProperty("id", BuiltInRegistries.BLOCK.getKey(block).toString());
            entry.addProperty("implementationClass", block.getClass().getName());
            Item blockItem = block.asItem();
            entry.add("blockItemId", blockItem == Items.AIR ? JsonNull.INSTANCE : new JsonPrimitive(BuiltInRegistries.ITEM.getKey(blockItem).toString()));
            entry.addProperty("defaultDestroyTime", block.defaultDestroyTime());
            entry.addProperty("explosionResistance", block.getExplosionResistance());
            entry.addProperty("friction", block.getFriction());
            entry.addProperty("speedFactor", block.getSpeedFactor());
            entry.addProperty("jumpFactor", block.getJumpFactor());
            entry.addProperty("dynamicShape", block.hasDynamicShape());
            FlammableBlockRegistry.Entry flammability = FlammableBlockRegistry.getDefaultInstance().get(block);
            if (flammability == null) {
                entry.add("flammability", JsonNull.INSTANCE);
            } else {
                JsonObject flame = new JsonObject();
                flame.addProperty("igniteOdds", flammability.getIgniteOdds());
                flame.addProperty("burnOdds", flammability.getBurnOdds());
                entry.add("flammability", flame);
            }
            List<Property<?>> properties = new ArrayList<>(block.getStateDefinition().getProperties());
            properties.sort(Comparator.comparing(Property::getName));
            JsonObject domains = new JsonObject();
            for (Property<?> property : properties) domains.add(property.getName(), propertyDomain(property));
            entry.add("propertyDomains", domains);
            entry.add("defaultState", stateValues(block.defaultBlockState(), properties));
            JsonArray states = new JsonArray();
            for (BlockState state : block.getStateDefinition().getPossibleStates()) {
                JsonObject stateData = new JsonObject();
                stateData.add("values", stateValues(state, properties));
                stateData.addProperty("lightEmission", state.getLightEmission());
                stateData.addProperty("lightDampening", state.getLightDampening());
                stateData.addProperty("air", state.isAir());
                stateData.addProperty("liquid", state.liquid());
                var fluidState = state.getFluidState();
                JsonObject fluid = new JsonObject();
                fluid.addProperty("type", BuiltInRegistries.FLUID.getKey(fluidState.getType()).toString());
                fluid.addProperty("source", fluidState.isSource());
                fluid.addProperty("amount", fluidState.getAmount());
                stateData.add("fluid", fluid);
                stateData.addProperty("ignitedByLava", state.ignitedByLava());
                stateData.addProperty("solidRender", state.isSolidRender());
                stateData.addProperty("canOcclude", state.canOcclude());
                stateData.addProperty("replaceable", state.canBeReplaced());
                stateData.addProperty("requiresCorrectTool", state.requiresCorrectToolForDrops());
                stateData.addProperty("randomlyTicking", state.isRandomlyTicking());
                stateData.addProperty("hasBlockEntity", state.hasBlockEntity());
                stateData.addProperty("emissiveRendering", state.emissiveRendering());
                stateData.addProperty("pistonReaction", state.getPistonPushReaction().name());
                stateData.addProperty("renderShape", state.getRenderShape().name());
                states.add(stateData);
            }
            entry.add("states", states);
            output.add(entry);
        }
        return output;
    }

    private static <T extends Comparable<T>> JsonObject propertyDomain(Property<T> property) {
        JsonObject result = new JsonObject();
        result.addProperty("javaType", property.getValueClass().getName());
        JsonArray values = new JsonArray();
        for (T value : property.getPossibleValues()) values.add(propertyValue(property, value));
        result.add("values", values);
        return result;
    }

    private static JsonObject stateValues(BlockState state, List<Property<?>> properties) {
        JsonObject output = new JsonObject();
        for (Property<?> property : properties) output.add(property.getName(), stateValue(state, property));
        return output;
    }

    private static <T extends Comparable<T>> JsonElement stateValue(BlockState state, Property<T> property) {
        return propertyValue(property, state.getValue(property));
    }

    private static <T extends Comparable<T>> JsonElement propertyValue(Property<T> property, T value) {
        if (value instanceof Boolean booleanValue) return new JsonPrimitive(booleanValue);
        if (value instanceof Number numberValue) return new JsonPrimitive(numberValue);
        return new JsonPrimitive(property.getName(value));
    }

    private static JsonArray exportItems(RegistryOps<JsonElement> ops, JsonArray issues) {
        List<Item> items = new ArrayList<>();
        for (Item item : BuiltInRegistries.ITEM) if (included(BuiltInRegistries.ITEM.getKey(item))) items.add(item);
        items.sort(Comparator.comparing(item -> BuiltInRegistries.ITEM.getKey(item).toString()));
        JsonArray output = new JsonArray();
        for (Item item : items) {
            String itemId = BuiltInRegistries.ITEM.getKey(item).toString();
            JsonObject entry = new JsonObject();
            entry.addProperty("id", itemId);
            entry.addProperty("implementationClass", item.getClass().getName());
            entry.addProperty("defaultMaxStackSize", item.getDefaultMaxStackSize());
            List<TypedDataComponent<?>> components = new ArrayList<>();
            for (TypedDataComponent<?> component : item.components()) components.add(component);
            components.sort(Comparator.comparing(component -> BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(component.type()).toString()));
            JsonObject encoded = new JsonObject();
            JsonObject encodings = new JsonObject();
            JsonArray componentIds = new JsonArray();
            for (TypedDataComponent<?> component : components) {
                String componentId = BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(component.type()).toString();
                componentIds.add(componentId);
                try {
                    if (component.type() == DataComponents.BLOCK_TRANSFORMER) {
                        var holder = item.components().get(DataComponents.BLOCK_TRANSFORMER);
                        DataResult<JsonElement> result = BlockTransformer.DIRECT_CODEC.encodeStart(ops, holder.value());
                        var value = result.result();
                        var error = result.error();
                        if (value.isPresent() && error.isEmpty()) {
                            JsonObject expanded = new JsonObject();
                            var reference = holder.unwrapKey();
                            expanded.addProperty("registry", Registries.BLOCK_TRANSFORMER.identifier().toString());
                            expanded.addProperty("holderKind", reference.isPresent() ? "reference" : "direct");
                            expanded.add("reference", reference.<JsonElement>map(key -> new JsonPrimitive(key.identifier().toString())).orElse(JsonNull.INSTANCE));
                            expanded.add("value", value.get());
                            encoded.add(componentId, expanded);
                            encodings.addProperty(componentId, "expanded-registry-value");
                        } else {
                            issue(issues, itemId + "/" + componentId, error.map(detail -> detail.message()).orElse("Transformer value codec returned no complete value"));
                        }
                    } else {
                        DataResult<JsonElement> result = component.encodeValue(ops);
                        var value = result.result();
                        var error = result.error();
                        if (value.isPresent() && error.isEmpty()) encoded.add(componentId, value.get());
                        else issue(issues, itemId + "/" + componentId, error.map(detail -> detail.message()).orElse("Codec returned no complete value"));
                    }
                } catch (Exception error) {
                    issue(issues, itemId + "/" + componentId, error.getClass().getName() + ": " + error.getMessage());
                }
            }
            entry.add("componentIds", componentIds);
            entry.add("components", encoded);
            entry.add("componentEncodings", encodings);
            output.add(entry);
        }
        return output;
    }

    private static JsonArray exportEntities() {
        List<EntityType<?>> types = new ArrayList<>();
        for (EntityType<?> type : BuiltInRegistries.ENTITY_TYPE) if (included(BuiltInRegistries.ENTITY_TYPE.getKey(type))) types.add(type);
        types.sort(Comparator.comparing(type -> BuiltInRegistries.ENTITY_TYPE.getKey(type).toString()));
        JsonArray output = new JsonArray();
        for (EntityType<?> type : types) {
            JsonObject entry = new JsonObject();
            entry.addProperty("id", BuiltInRegistries.ENTITY_TYPE.getKey(type).toString());
            entry.addProperty("category", type.getCategory().name());
            entry.addProperty("width", type.getWidth());
            entry.addProperty("height", type.getHeight());
            entry.add("defaultLootTable", type.getDefaultLootTable().<JsonElement>map(key -> new JsonPrimitive(key.identifier().toString())).orElse(JsonNull.INSTANCE));
            output.add(entry);
        }
        return output;
    }

    private static JsonArray exportBiomes(MinecraftServer server, RegistryOps<JsonElement> ops, JsonArray issues) {
        JsonArray output = new JsonArray();
        server.registryAccess().lookupOrThrow(Registries.BIOME).listElements()
                .filter(holder -> included(holder.key().identifier()))
                .sorted(Comparator.comparing(holder -> holder.key().identifier().toString()))
                .forEach(holder -> {
                    String id = holder.key().identifier().toString();
                    JsonObject entry = new JsonObject();
                    entry.addProperty("id", id);
                    DataResult<JsonElement> encoded = Biome.DIRECT_CODEC.encodeStart(ops, holder.value());
                    if (encoded.result().isPresent() && encoded.error().isEmpty()) entry.add("value", encoded.result().get());
                    else issue(issues, id, encoded.error().map(error -> error.message()).orElse("Biome codec returned no complete value"));
                    output.add(entry);
                });
        return output;
    }

    private static <T> JsonArray exportTags(HolderLookup<T> registry) {
        JsonArray output = new JsonArray();
        registry.listTags().sorted(Comparator.comparing(tag -> tag.key().location().toString())).forEach(tag -> {
            JsonObject entry = new JsonObject();
            entry.addProperty("id", tag.key().location().toString());
            entry.addProperty("bound", tag.isBound());
            entry.add("members", tag.isBound()
                    ? strings(tag.stream().map(holder -> holder.unwrapKey().orElseThrow().identifier().toString()).sorted().toList())
                    : JsonNull.INSTANCE);
            output.add(entry);
        });
        return output;
    }

    private static JsonObject exportRegistryTags(HolderLookup.Provider registries) {
        JsonObject output = new JsonObject();
        registries.listRegistryKeys().sorted(Comparator.comparing(key -> key.identifier().toString())).forEach(key ->
                output.add(key.identifier().toString(), exportTags(registries.lookupOrThrow(key))));
        return output;
    }

    private static JsonArray exportDataResources(MinecraftServer server, JsonArray issues) throws Exception {
        // Empty prefixes are rejected by some physical resource-pack backends.
        // Discover actual top-level directories and include the standard virtual roots.
        TreeSet<String> prefixes = new TreeSet<>(Set.of("advancement", "recipe", "loot_table", "tags",
                "worldgen", "wover", "patchouli_books", "structure", "jukebox_song", "enchantment", "number_provider"));
        for (ModContainer mod : FabricLoader.getInstance().getAllMods()) {
            for (Path root : mod.getRootPaths()) {
                Path data = root.resolve("data");
                if (!Files.isDirectory(data)) continue;
                try (var namespaces = Files.list(data)) {
                    for (Path namespace : namespaces.filter(Files::isDirectory).toList()) {
                        try (var directories = Files.list(namespace)) {
                            directories.filter(Files::isDirectory).forEach(directory -> prefixes.add(directory.getFileName().toString()));
                        }
                    }
                }
            }
        }
        var resources = new HashMap<Identifier, Resource>();
        for (String prefix : prefixes) {
            resources.putAll(server.getResourceManager().listResources(prefix, id -> id.getPath().endsWith(".json")));
        }
        if (resources.isEmpty()) issue(issues, "resources", "No effective data resources were enumerated");
        List<Identifier> identifiers = new ArrayList<>(resources.keySet());
        identifiers.sort(Comparator.comparing(Identifier::toString));
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        JsonArray output = new JsonArray();
        for (Identifier id : identifiers) {
            var resource = resources.get(id);
            JsonObject entry = new JsonObject();
            entry.addProperty("id", id.toString());
            entry.addProperty("sourcePack", resource.sourcePackId());
            try (InputStream stream = resource.open()) {
                byte[] bytes = stream.readAllBytes();
                entry.addProperty("sha256", java.util.HexFormat.of().formatHex(digest.digest(bytes)));
                entry.add("value", JsonParser.parseString(new String(bytes, StandardCharsets.UTF_8)));
            } catch (Exception error) {
                issue(issues, id.toString(), error.getClass().getName() + ": " + error.getMessage());
            }
            output.add(entry);
        }
        return output;
    }

    private static JsonObject environment(MinecraftServer server, FabricLoader loader, Path workspace, boolean production) throws Exception {
        JsonObject output = new JsonObject();
        output.addProperty("minecraftVersion", server.getServerVersion());
        output.addProperty("javaVersion", System.getProperty("java.version"));
        output.addProperty("productionProfile", production);
        output.addProperty("developmentEnvironment", loader.isDevelopmentEnvironment());
        output.addProperty("environmentType", loader.getEnvironmentType().name());
        output.addProperty("datagenFlagPresent", System.getProperties().containsKey("fabric-api.datagen"));
        output.addProperty("gametestFlagPresent", System.getProperties().containsKey("fabric-api.gametest"));
        output.addProperty("players", server.getPlayerCount());
        output.addProperty("overworldSeed", Long.toString(server.overworld().getSeed()));
        output.addProperty("worldName", server.getWorldData().getLevelName());
        output.addProperty("flatWorld", server.getWorldData().isFlatWorld());
        output.addProperty("debugWorld", server.getWorldData().isDebugWorld());
        output.add("selectedPacks", strings(server.getPackRepository().getSelectedIds().stream().sorted().toList()));
        JsonArray mods = new JsonArray();
        List<ModContainer> containers = new ArrayList<>(loader.getAllMods());
        containers.sort(Comparator.comparing(container -> container.getMetadata().getId()));
        for (ModContainer container : containers) {
            JsonObject mod = new JsonObject();
            mod.addProperty("id", container.getMetadata().getId());
            mod.addProperty("version", container.getMetadata().getVersion().getFriendlyString());
            ModOrigin origin = container.getOrigin();
            mod.addProperty("originKind", origin.getKind().name());
            if (origin.getKind() == ModOrigin.Kind.PATH) {
                JsonArray paths = new JsonArray();
                for (Path source : origin.getPaths()) {
                    JsonObject file = new JsonObject();
                    Path absolute = source.toAbsolutePath().normalize();
                    file.addProperty("path", absolute.startsWith(workspace) ? workspace.relativize(absolute).toString().replace('\\', '/') : absolute.toString());
                    if (Files.isRegularFile(absolute)) file.addProperty("sha256", sha256(absolute));
                    paths.add(file);
                }
                mod.add("origins", paths);
            } else if (origin.getKind() == ModOrigin.Kind.NESTED) {
                mod.addProperty("parentModId", origin.getParentModId());
                mod.addProperty("parentSubLocation", origin.getParentSubLocation());
            }
            mods.add(mod);
        }
        output.add("mods", mods);
        JsonArray configs = new JsonArray();
        Path configRoot = loader.getConfigDir().toAbsolutePath().normalize();
        if (!configRoot.startsWith(workspace)) throw new IllegalArgumentException("Reference configuration escaped the owned workspace");
        if (Files.isDirectory(configRoot)) {
            try (var paths = Files.walk(configRoot)) {
                for (Path config : paths.filter(Files::isRegularFile).sorted().toList()) {
                    if (!config.toRealPath().startsWith(workspace)) throw new IllegalArgumentException("Configuration symlink escaped the workspace");
                    String name = config.getFileName().toString();
                    if (!name.endsWith(".json") && !name.endsWith(".json5") && !name.endsWith(".properties") && !name.endsWith(".toml")) continue;
                    JsonObject entry = new JsonObject();
                    entry.addProperty("path", configRoot.relativize(config).toString().replace('\\', '/'));
                    entry.addProperty("sha256", sha256(config));
                    entry.addProperty("content", Files.readString(config, StandardCharsets.UTF_8));
                    configs.add(entry);
                }
            }
        }
        output.add("configurationFiles", configs);
        return output;
    }

    private static boolean included(Identifier id) {
        return CONTENT_NAMESPACES.contains(id.getNamespace());
    }

    private static JsonArray strings(List<String> values) {
        JsonArray result = new JsonArray();
        for (String value : values) result.add(value);
        return result;
    }

    private static void issue(JsonArray issues, String subject, String message) {
        JsonObject issue = new JsonObject();
        issue.addProperty("subject", subject);
        issue.addProperty("message", message);
        issues.add(issue);
    }

    private static Path requiredPath(String property) {
        String value = System.getProperty(property);
        if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing required property " + property);
        return Path.of(value);
    }

    private static void validateOutput(Path workspace, Path output) throws Exception {
        if (!output.startsWith(workspace) || output.equals(workspace)) throw new IllegalArgumentException("Export output must stay under the Bedrock workspace");
        if (Files.exists(output)) throw new IllegalArgumentException("Refusing to overwrite an existing reference export");
        Path existingParent = output.getParent();
        while (!Files.exists(existingParent)) existingParent = existingParent.getParent();
        if (!existingParent.toRealPath().startsWith(workspace)) throw new IllegalArgumentException("Output ancestor escapes the workspace");
        Files.createDirectories(output.getParent());
    }

    private static String sha256(Path file) throws Exception {
        MessageDigest hash = MessageDigest.getInstance("SHA-256");
        try (InputStream input = Files.newInputStream(file)) {
            byte[] buffer = new byte[65536];
            int count;
            while ((count = input.read(buffer)) != -1) hash.update(buffer, 0, count);
        }
        return java.util.HexFormat.of().formatHex(hash.digest());
    }

    private static void writeCanonical(JsonElement element, JsonWriter writer) throws Exception {
        if (element.isJsonNull()) writer.nullValue();
        else if (element.isJsonArray()) {
            writer.beginArray();
            for (JsonElement entry : element.getAsJsonArray()) writeCanonical(entry, writer);
            writer.endArray();
        } else if (element.isJsonObject()) {
            writer.beginObject();
            List<String> keys = new ArrayList<>(element.getAsJsonObject().keySet());
            keys.sort(String::compareTo);
            for (String key : keys) {
                writer.name(key);
                writeCanonical(element.getAsJsonObject().get(key), writer);
            }
            writer.endObject();
        } else {
            JsonPrimitive primitive = element.getAsJsonPrimitive();
            if (primitive.isBoolean()) writer.value(primitive.getAsBoolean());
            else if (primitive.isNumber()) writer.value(primitive.getAsNumber());
            else writer.value(primitive.getAsString());
        }
    }
}
