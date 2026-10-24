cmake_minimum_required(VERSION 3.22)
project(VoiceStudioRuntimes LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
foreach(runtime omni llama)
    file(GLOB_RECURSE archives "${CMAKE_CURRENT_SOURCE_DIR}/build/${runtime}-${RUNTIME_ABI}/*.a")
    add_library(vs_${runtime} SHARED ${runtime}.cpp)
    target_include_directories(vs_${runtime} PRIVATE "${OMNI_SOURCE}/src" "${LLAMA_SOURCE}/include" "${LLAMA_SOURCE}/ggml/include")
    target_link_libraries(vs_${runtime} PRIVATE -Wl,--start-group ${archives} -Wl,--end-group android log)
    # Both runtimes vendor different ggml versions. Bind internally and export
    # only JNI: loading either order cannot interpose the other runtime's ABI.
    target_link_options(vs_${runtime} PRIVATE -Wl,--exclude-libs,ALL -Wl,-Bsymbolic -Wl,-z,max-page-size=16384)
    target_compile_options(vs_${runtime} PRIVATE -fvisibility=hidden)
endforeach()
